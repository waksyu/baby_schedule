// html2canvasはindex.htmlのCDNからグローバルに読み込まれます。
// Fix: Declare html2canvas to resolve 'Cannot find name' error.
declare var html2canvas: any;

// State Management
const defaultSettings = {
    milkInterval: 3,
    morningNapOffset: 2,
    morningNapDuration: 1,
    afternoonNap1Offset: 1,
    afternoonNap1Duration: 2,
    afternoonNap2Offset: 2,
    afternoonNap2Duration: 1,
    bathOffset: 1,
    bathDuration: 0.5,
    bedtimeOffset: 0.5,
};

let state = {
    wakeUpTime: '07:00',
    settings: { ...defaultSettings },
    schedule: null,
    isLoading: false,
    isSettingsOpen: false,
    currentTime: new Date(),
    isDownloading: false,
};

// Helper Functions
const formatTime = (time) => {
    const hours = Math.floor(time);
    const minutes = Math.round((time - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const parseTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + minutes / 60;
};

const getColor = (activity) => {
    if (activity.startsWith('起床')) return '#FFDDC1';
    if (activity.startsWith('ミルク')) return '#FFFACD';
    if (activity.includes('お昼寝')) return '#E6E6FA';
    if (activity.startsWith('お風呂')) return '#B2EBF2';
    if (activity.startsWith('就寝')) return '#000080';
    return '#F5F5F5';
};

const getFormattedDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];
    return `${year}年${month}月${day}日(${dayOfWeek})`;
};

// DOM Elements
const DOMElements = {
    initialControls: document.getElementById('initial-controls'),
    // Fix: Specify HTMLElement for querySelectorAll to correctly type 'btn.dataset'.
    timeOptionBtns: document.querySelectorAll<HTMLElement>('.time-option-btn'),
    generateBtn: document.getElementById('generate-btn'),
    loader: document.getElementById('loader'),
    scheduleDisplay: document.getElementById('schedule-display'),
    placeholder: document.getElementById('placeholder'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsPopupContainer: document.getElementById('settings-popup-container'),
    timelineViewContainer: document.getElementById('timeline-view-container'),
    clockViewContainer: document.getElementById('clock-view-container'),
    scheduleDate: document.getElementById('schedule-date'),
    shiftBackBtn: document.getElementById('shift-back-btn'),
    shiftForwardBtn: document.getElementById('shift-forward-btn'),
    downloadHorizontalBtn: document.getElementById('download-horizontal-btn'),
    downloadVerticalBtn: document.getElementById('download-vertical-btn'),
    resetBtn: document.getElementById('reset-btn'),
    horizontalCaptureContainer: document.getElementById('horizontal-capture-container'),
    verticalCaptureContainer: document.getElementById('vertical-capture-container'),
    tooltip: document.getElementById('tooltip'),
};

// Render Functions
function render() {
    // Controls visibility
    DOMElements.initialControls.style.display = state.schedule ? 'none' : 'block';
    DOMElements.placeholder.style.display = state.schedule ? 'none' : 'block';
    DOMElements.scheduleDisplay.style.display = state.schedule ? 'block' : 'none';
    DOMElements.loader.style.display = state.isLoading ? 'block' : 'none';
    
    // Header buttons visibility
    const showHeaderActions = !!state.schedule;
    DOMElements.downloadHorizontalBtn.style.display = showHeaderActions ? 'flex' : 'none';
    DOMElements.downloadVerticalBtn.style.display = showHeaderActions ? 'flex' : 'none';
    DOMElements.resetBtn.style.display = showHeaderActions ? 'flex' : 'none';

    // Wake up time buttons
    DOMElements.timeOptionBtns.forEach(btn => {
        // Fix: 'dataset' property is now correctly recognized due to querySelectorAll<HTMLElement> change.
        if (btn.dataset.time === state.wakeUpTime) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    if (state.schedule) {
        DOMElements.scheduleDate.textContent = getFormattedDate();
        renderTimelineView(state.schedule, state.currentTime);
        renderClockView(state.schedule, state.currentTime);
    }

    renderSettingsPopup();
}

function renderTimelineView(schedule, currentTime) {
    const timelineHTML = `
        <ul class="timeline" id="timeline-list">
            ${schedule.map(item => `
                <li class="timeline-item">
                    <div class="timeline-time">${item.time}</div>
                    <div class="timeline-icon-wrapper" style="--activity-color: ${getColor(item.activity)}">
                         <span class="timeline-icon">${item.icon}</span>
                    </div>
                    <div class="timeline-activity">${item.activity}</div>
                </li>
            `).join('')}
        </ul>
        <div class="current-time-indicator" id="current-time-indicator" style="display: none;"></div>
    `;
    DOMElements.timelineViewContainer.innerHTML = timelineHTML;
    updateCurrentTimeIndicator();
}

function updateCurrentTimeIndicator() {
    const indicator = document.getElementById('current-time-indicator');
    const timeline = document.getElementById('timeline-list');
    if (!state.currentTime || !indicator || !timeline || !state.schedule || state.schedule.length < 2) {
        if(indicator) indicator.style.display = 'none';
        return;
    }

    const currentHourDecimal = state.currentTime.getHours() + state.currentTime.getMinutes() / 60;
    
    let prevEventIndex = -1;
    for (let i = 0; i < state.schedule.length; i++) {
        if (parseTime(state.schedule[i].time) <= currentHourDecimal) {
            prevEventIndex = i;
        } else {
            break;
        }
    }

    if (prevEventIndex === -1 || prevEventIndex >= state.schedule.length - 1) {
        indicator.style.display = 'none';
        return;
    }
    
    const nextEventIndex = prevEventIndex + 1;

    const listItems = timeline.children;
    // Fix: Cast timeline children to HTMLElement to access offsetTop and offsetHeight.
    const prevEventElement = listItems[prevEventIndex] as HTMLElement;
    const nextEventElement = listItems[nextEventIndex] as HTMLElement;

    if (!prevEventElement || !nextEventElement) {
        indicator.style.display = 'none';
        return;
    }

    const prevEventTop = prevEventElement.offsetTop + prevEventElement.offsetHeight / 2;
    const nextEventTop = nextEventElement.offsetTop + nextEventElement.offsetHeight / 2;

    const prevEventTime = parseTime(state.schedule[prevEventIndex].time);
    const nextEventTime = parseTime(state.schedule[nextEventIndex].time);

    const timeDiff = nextEventTime - prevEventTime;
    if (timeDiff <= 0) {
        indicator.style.display = 'none';
        return;
    }

    const timeRatio = (currentHourDecimal - prevEventTime) / timeDiff;
    const positionDiff = nextEventTop - prevEventTop;
    const topPosition = prevEventTop + (positionDiff * timeRatio);

    indicator.style.top = `${topPosition}px`;
    indicator.style.display = 'block';
}

function renderClockView(schedule, currentTime) {
    const size = 320;
    const center = size / 2;
    const outerRadius = size / 2 - 10;
    const labelBandWidth = 45;
    const innerRadius = outerRadius - labelBandWidth;
    const CLOCK_START_HOUR = 9;
    const CLOCK_END_HOUR = 21;
    const TOTAL_HOURS = CLOCK_END_HOUR - CLOCK_START_HOUR;

    const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians)),
        };
    };

    const timeToAngle = (time) => (time - CLOCK_START_HOUR) / TOTAL_HOURS * 360 - 90;

    const describeSector = (x, y, radius, startAngle, endAngle) => {
        if (endAngle - startAngle >= 360) endAngle = startAngle + 359.99;
        const start = polarToCartesian(x, y, radius, startAngle);
        const end = polarToCartesian(x, y, radius, endAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
        return `M ${x} ${y} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
    };

    const eventsInClockRange = schedule.filter(event => {
        const eventTime = parseTime(event.time);
        return eventTime >= CLOCK_START_HOUR && eventTime < CLOCK_END_HOUR;
    });

    const clockSectors = eventsInClockRange.map((event, index) => {
        const startTime = parseTime(event.time);
        const duration = event.duration ?? (() => {
            if (index < eventsInClockRange.length - 1) {
                const nextEventTime = parseTime(eventsInClockRange[index + 1].time);
                return nextEventTime > startTime ? nextEventTime - startTime : (CLOCK_END_HOUR - startTime);
            }
            return CLOCK_END_HOUR - startTime;
        })();
        
        let endTime = startTime + duration;
        if (endTime > CLOCK_END_HOUR) endTime = CLOCK_END_HOUR;

        const startAngle = timeToAngle(startTime);
        const endAngle = timeToAngle(endTime);
        const midAngle = startAngle + (endAngle - startAngle) / 2;
        const iconRadius = innerRadius * 0.7;
        const iconPos = polarToCartesian(center, center, iconRadius, midAngle);

        return {
            ...event,
            path: describeSector(center, center, innerRadius, startAngle, endAngle),
            color: getColor(event.activity),
            iconPos
        };
    });
    
    const timeLabels = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
        const hour = CLOCK_START_HOUR + i;
        const angle = timeToAngle(hour);
        const pos = polarToCartesian(center, center, outerRadius - labelBandWidth / 2, angle);
        let label = i === 0 ? `${CLOCK_START_HOUR}・${CLOCK_END_HOUR}` : (i === TOTAL_HOURS ? '' : String(hour));
        const markerLength = (hour % 2 === 0) ? 8 : 4;
        const markerInnerPos = polarToCartesian(center, center, outerRadius - markerLength, angle);
        const markerPosEnd = polarToCartesian(center, center, outerRadius, angle);
        return { hour, pos, label, markerInnerPos, markerPosEnd, isStartEnd: i === 0 || i === TOTAL_HOURS };
    });

    let currentTimeHand = '';
    if (currentTime) {
        const currentHourDecimal = currentTime.getHours() + currentTime.getMinutes() / 60;
        if (currentHourDecimal >= CLOCK_START_HOUR && currentHourDecimal < CLOCK_END_HOUR) {
            const angle = timeToAngle(currentHourDecimal);
            const endPos = polarToCartesian(center, center, innerRadius, angle);
            currentTimeHand = `<line x1="${center}" y1="${center}" x2="${endPos.x}" y2="${endPos.y}" stroke="#007bff" stroke-width="2" />`;
        }
    }
    
    const sunPos = polarToCartesian(center, center, outerRadius - labelBandWidth/2, -75);
    const moonPos = polarToCartesian(center, center, outerRadius - labelBandWidth/2, -105);

    const clockHTML = `
        <div class="clock-container">
            <svg viewBox="0 0 ${size} ${size}" width="100%" height="100%">
                <circle cx="${center}" cy="${center}" r="${outerRadius}" fill="#f0f0f0" />
                <circle cx="${center}" cy="${center}" r="${innerRadius}" fill="white" />
                ${clockSectors.map((sector, i) => `
                    <path
                        d="${sector.path}"
                        fill="${sector.color}"
                        class="clock-sector"
                        data-tooltip="${sector.time}: ${sector.activity}"
                    />
                `).join('')}
                ${timeLabels.map(({ hour, pos, label, markerInnerPos, markerPosEnd, isStartEnd }) => `
                    <g>
                        ${!isStartEnd ? `<line x1="${markerInnerPos.x}" y1="${markerInnerPos.y}" x2="${markerPosEnd.x}" y2="${markerPosEnd.y}" stroke="#ccc" stroke-width="1" />` : ''}
                        ${label ? `<text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle" font-weight="bold" font-size="14">${label}</text>` : ''}
                    </g>
                `).join('')}
                 <line x1="${polarToCartesian(center, center, innerRadius, -90).x}" y1="${polarToCartesian(center, center, innerRadius, -90).y}" x2="${polarToCartesian(center, center, outerRadius, -90).x}" y2="${polarToCartesian(center, center, outerRadius, -90).y}" stroke="black" stroke-width="2" />
                 <text x="${sunPos.x}" y="${sunPos.y}" text-anchor="middle" dominant-baseline="middle" font-size="16">↑🌞</text>
                 <text x="${moonPos.x}" y="${moonPos.y}" text-anchor="middle" dominant-baseline="middle" font-size="16">↑🌙</text>
                ${clockSectors.map((sector, i) => `
                    <text x="${sector.iconPos.x}" y="${sector.iconPos.y}" text-anchor="middle" dominant-baseline="middle" font-size="20" class="clock-icon">${sector.icon}</text>
                `).join('')}
                ${currentTimeHand}
            </svg>
        </div>
    `;
    DOMElements.clockViewContainer.innerHTML = clockHTML;
}


function renderSettingsPopup() {
    if (!state.isSettingsOpen) {
        DOMElements.settingsPopupContainer.innerHTML = '';
        return;
    }

    const { milkInterval, morningNapOffset, morningNapDuration, afternoonNap1Offset, afternoonNap1Duration, afternoonNap2Offset, afternoonNap2Duration, bathOffset, bathDuration, bedtimeOffset } = state.settings;

    const content = state.schedule ? 
        '<p class="settings-disabled-message">スケジュール作成後に設定は変更できません。やり直す場合はリセットボタンを押してください。</p>' :
        `<fieldset class="customize-section">
            <legend>基本設定</legend>
            <div class="control-group">
                <label for="milkInterval">ミルクの間隔 (時間)</label>
                <input type="number" id="milkInterval" data-setting="milkInterval" value="${milkInterval}" min="2" max="5" step="0.5" />
            </div>
            <legend>お昼寝の設定</legend>
            <div class="control-group">
                <label for="morningNapOffset">朝寝開始 (最初のミルクから, 時間)</label>
                <input type="number" id="morningNapOffset" data-setting="morningNapOffset" value="${morningNapOffset}" min="0" step="0.5" />
            </div>
            <div class="control-group">
                <label for="morningNapDuration">朝寝の時間 (時間)</label>
                <input type="number" id="morningNapDuration" data-setting="morningNapDuration" value="${morningNapDuration}" min="0" step="0.5" />
            </div>
            <div class="control-group">
                <label for="afternoonNap1Offset">昼寝開始 (2回目のミルクから, 時間)</label>
                <input type="number" id="afternoonNap1Offset" data-setting="afternoonNap1Offset" value="${afternoonNap1Offset}" min="0" step="0.5" />
            </div>
            <div class="control-group">
                <label for="afternoonNap1Duration">昼寝の時間 (時間)</label>
                <input type="number" id="afternoonNap1Duration" data-setting="afternoonNap1Duration" value="${afternoonNap1Duration}" min="0" step="0.5" />
            </div>
            <div class="control-group">
                <label for="afternoonNap2Offset">夕寝開始 (3回目のミルクから, 時間)</label>
                <input type="number" id="afternoonNap2Offset" data-setting="afternoonNap2Offset" value="${afternoonNap2Offset}" min="0" step="0.5" />
            </div>
            <div class="control-group">
                <label for="afternoonNap2Duration">夕寝の時間 (時間)</label>
                <input type="number" id="afternoonNap2Duration" data-setting="afternoonNap2Duration" value="${afternoonNap2Duration}" min="0" step="0.5" />
            </div>
            <legend>夜の準備</legend>
            <div class="control-group">
                <label for="bathOffset">お風呂開始 (17時以降のミルクから, 時間)</label>
                <input type="number" id="bathOffset" data-setting="bathOffset" value="${bathOffset}" min="0" step="0.5" />
            </div>
            <div class="control-group">
                <label for="bathDuration">お風呂の時間 (時間)</label>
                <input type="number" id="bathDuration" data-setting="bathDuration" value="${bathDuration}" min="0" step="0.5" />
            </div>
            <div class="control-group">
                <label for="bedtimeOffset">寝かしつけ (お風呂の後, 時間)</label>
                <input type="number" id="bedtimeOffset" data-setting="bedtimeOffset" value="${bedtimeOffset}" min="0" step="0.5" />
            </div>
        </fieldset>`;
    
    const popupHTML = `
        <div class="settings-popup-overlay">
            <div class="settings-popup-content">
                <button class="settings-popup-close">&times;</button>
                ${content}
            </div>
        </div>
    `;
    DOMElements.settingsPopupContainer.innerHTML = popupHTML;

    // Add event listeners for the new elements
    const overlay = DOMElements.settingsPopupContainer.querySelector('.settings-popup-overlay');
    const closeBtn = DOMElements.settingsPopupContainer.querySelector('.settings-popup-close');
    overlay.addEventListener('click', () => { state.isSettingsOpen = false; render(); });
    closeBtn.addEventListener('click', () => { state.isSettingsOpen = false; render(); });
    DOMElements.settingsPopupContainer.querySelector('.settings-popup-content').addEventListener('click', (e) => e.stopPropagation());

    DOMElements.settingsPopupContainer.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('change', (e) => {
            // Fix: Cast event target to HTMLInputElement to access dataset and value properties.
            const target = e.target as HTMLInputElement;
            const setting = target.dataset.setting;
            const value = target.value;
            if (setting) {
                (state.settings as any)[setting] = Number(value);
            }
        });
    });
}


// Event Handlers & Logic
function generateSchedule() {
    if (!state.wakeUpTime) return;
    state.isLoading = true;
    state.schedule = null;
    render();

    setTimeout(() => {
        const wakeUp = parseTime(state.wakeUpTime);
        let events = [];
        let bathTime = null;
        let bedtime = null;

        let potentialMilkTimes = [];
        let currentMilkTime = wakeUp;
        while (currentMilkTime < wakeUp + 24) {
            potentialMilkTimes.push(currentMilkTime);
            currentMilkTime += state.settings.milkInterval;
        }
        
        const firstMilkAfter5PM = potentialMilkTimes.find(t => t >= 17);
        if (firstMilkAfter5PM) {
            bathTime = firstMilkAfter5PM + state.settings.bathOffset;
            bedtime = bathTime + state.settings.bathDuration + state.settings.bedtimeOffset;
        } else {
            bedtime = wakeUp + 14;
        }
        
        const milkTimes = potentialMilkTimes.filter(t => t < bedtime);

        events.push({ time: formatTime(wakeUp), activity: '起床', icon: '☀️' });
        
        milkTimes.forEach((milkTime) => {
            events.push({ time: formatTime(milkTime), activity: 'ミルク', icon: '🍼', duration: 0.5 });
        });

        if (milkTimes.length > 0) {
            const morningNapStart = milkTimes[0] + state.settings.morningNapOffset;
            events.push({ time: formatTime(morningNapStart), activity: 'お昼寝', icon: '😴', duration: state.settings.morningNapDuration });
        }
        if (milkTimes.length > 1) {
            const afternoonNap1Start = milkTimes[1] + state.settings.afternoonNap1Offset;
            events.push({ time: formatTime(afternoonNap1Start), activity: 'お昼寝', icon: '😴', duration: state.settings.afternoonNap1Duration });
        }
        if (milkTimes.length > 2) {
             const afternoonNap2Start = milkTimes[2] + state.settings.afternoonNap2Offset;
             events.push({ time: formatTime(afternoonNap2Start), activity: 'お昼寝', icon: '😴', duration: state.settings.afternoonNap2Duration });
        }
        
        if (bathTime) {
            events.push({ time: formatTime(bathTime), activity: 'お風呂', icon: '🛁', duration: state.settings.bathDuration });
        }
        
        events.push({ time: formatTime(bedtime), activity: '就寝', icon: '🌙' });

        events.sort((a, b) => parseTime(a.time) - parseTime(b.time));
        
        state.isLoading = false;
        state.schedule = events;
        render();
    }, 500);
}

function shiftSchedule(minutes) {
    if (!state.schedule) return;
    state.schedule = state.schedule.map(event => {
        const eventTime = parseTime(event.time);
        const newTime = eventTime + minutes / 60;
        return { ...event, time: formatTime(newTime) };
    });
    render();
}

function reset() {
    state.wakeUpTime = '07:00';
    state.schedule = null;
    state.isLoading = false;
    state.isSettingsOpen = false;
    state.settings = { ...defaultSettings };
    render();
}

async function handleDownload(layout, buttonElement) {
    if (state.isDownloading) return;
    state.isDownloading = true;

    buttonElement.classList.add('downloading');
    const actionButtons = [
        DOMElements.downloadHorizontalBtn,
        DOMElements.downloadVerticalBtn,
        DOMElements.resetBtn,
        DOMElements.settingsBtn,
        DOMElements.shiftBackBtn,
        DOMElements.shiftForwardBtn,
    ];
    // Fix: Cast buttons to HTMLButtonElement to set the disabled property.
    actionButtons.forEach(btn => (btn as HTMLButtonElement).disabled = true);

    const containerId = layout === 'horizontal' ? 'horizontal-capture-container' : 'vertical-capture-container';
    const captureContainer = document.getElementById(containerId);
    
    // Render static version for capture
    const headerHTML = `<div class="download-header">${getFormattedDate()}</div>`;
    const timelineHTML = `<div class="download-timeline-col">${DOMElements.timelineViewContainer.innerHTML}</div>`;
    const clockHTML = `<div class="download-clock-col">${DOMElements.clockViewContainer.innerHTML}</div>`;

    captureContainer.innerHTML = `${headerHTML}<div class="download-content-wrapper">${timelineHTML}${clockHTML}</div>`;
    // Remove time indicator for cleaner image
    const indicator = captureContainer.querySelector('#current-time-indicator');
    if (indicator) indicator.remove();


    try {
        await new Promise(resolve => setTimeout(resolve, 100));
        // Fix: html2canvas is now declared globally.
        const canvas = await html2canvas(captureContainer, { scale: 2, backgroundColor: '#FFF9E6' });
        const now = new Date();
        const dateString = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const link = document.createElement('a');
        link.download = `${dateString}_baby-schedule_${layout}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error('Image download failed:', err);
        alert('画像の保存に失敗しました。');
    } finally {
        state.isDownloading = false;
        buttonElement.classList.remove('downloading');
        // Fix: Cast buttons to HTMLButtonElement to set the disabled property.
        actionButtons.forEach(btn => (btn as HTMLButtonElement).disabled = false);
        captureContainer.innerHTML = ''; // Clean up
    }
}


// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Set up event listeners
    DOMElements.timeOptionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Fix: 'dataset' property is now correctly recognized due to querySelectorAll<HTMLElement> change.
            state.wakeUpTime = btn.dataset.time;
            render();
        });
    });

    DOMElements.generateBtn.addEventListener('click', generateSchedule);
    DOMElements.settingsBtn.addEventListener('click', () => {
        state.isSettingsOpen = true;
        render();
    });
    DOMElements.shiftBackBtn.addEventListener('click', () => shiftSchedule(-30));
    DOMElements.shiftForwardBtn.addEventListener('click', () => shiftSchedule(30));
    DOMElements.resetBtn.addEventListener('click', reset);
    DOMElements.downloadHorizontalBtn.addEventListener('click', (e) => handleDownload('horizontal', e.currentTarget as HTMLElement));
    DOMElements.downloadVerticalBtn.addEventListener('click', (e) => handleDownload('vertical', e.currentTarget as HTMLElement));


    // Tooltip listener
    document.body.addEventListener('mousemove', (e) => {
        // Fix: Use a type guard to safely access properties on the event target.
        const target = e.target;
        if (target instanceof Element) {
            if (target.classList.contains('clock-sector') && (target as SVGElement).dataset.tooltip) {
                DOMElements.tooltip.textContent = (target as SVGElement).dataset.tooltip;
                DOMElements.tooltip.style.left = `${e.clientX + 10}px`;
                DOMElements.tooltip.style.top = `${e.clientY}px`;
                DOMElements.tooltip.style.display = 'block';
            } else {
                DOMElements.tooltip.style.display = 'none';
            }
        } else {
            DOMElements.tooltip.style.display = 'none';
        }
    });

    // Current time updater
    setInterval(() => {
        state.currentTime = new Date();
        if (state.schedule) {
            updateCurrentTimeIndicator();
            // We could re-render the clock too, but it's less critical than the indicator
            // renderClockView(state.schedule, state.currentTime);
        }
    }, 60 * 1000);

    // Initial render
    render();
});
