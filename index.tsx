import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// Add declaration for html2canvas
declare const html2canvas: any;

// Helper function to format time from a decimal number (e.g., 7.5 -> "07:30")
const formatTime = (time: number): string => {
    const hours = Math.floor(time);
    const minutes = Math.round((time - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// Helper function to parse time from a string (e.g., "07:30" -> 7.5)
const parseTime = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + minutes / 60;
};

interface ScheduleEvent {
    time: string;
    activity: string;
    icon: string;
    duration?: number; // duration in hours
}

interface TooltipData {
    content: string;
    x: number;
    y: number;
    visible: boolean;
}

// Shared color function
const getColor = (activity: string) => {
    if (activity.startsWith('起床')) return '#FFDDC1';
    if (activity.startsWith('ミルク')) return '#FFFACD'; // Cream color
    if (activity.includes('お昼寝')) return '#E6E6FA';
    if (activity.startsWith('お風呂')) return '#B2EBF2';
    if (activity.startsWith('就寝')) return '#000080'; // Navy color
    return '#F5F5F5';
};

// Settings Popup Component
const SettingsPopup: React.FC<{ isOpen: boolean; onClose: () => void; children: React.ReactNode }> = ({ isOpen, onClose, children }) => {
    if (!isOpen) return null;

    return (
        <div className="settings-popup-overlay" onClick={onClose}>
            <div className="settings-popup-content" onClick={(e) => e.stopPropagation()}>
                <button className="settings-popup-close" onClick={onClose}>&times;</button>
                {children}
            </div>
        </div>
    );
};


// Clock View Component
const ClockView: React.FC<{ schedule: ScheduleEvent[], currentTime: Date | null }> = ({ schedule, currentTime }) => {
    const [tooltip, setTooltip] = useState<TooltipData>({ content: '', x: 0, y: 0, visible: false });
    const svgRef = useRef<SVGSVGElement>(null);

    const CLOCK_START_HOUR = 9;
    const CLOCK_END_HOUR = 21;
    const TOTAL_HOURS = CLOCK_END_HOUR - CLOCK_START_HOUR;

    const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians)),
        };
    };
    
    // Angle starts from top (-90 deg)
    const timeToAngle = (time: number): number => {
        const hoursFromStart = time - CLOCK_START_HOUR;
        return (hoursFromStart / TOTAL_HOURS) * 360 - 90;
    };
    
    // New function to describe a sector (pie slice)
    const describeSector = (x: number, y: number, radius: number, startAngle: number, endAngle: number): string => {
        if (endAngle - startAngle >= 360) {
            endAngle = startAngle + 359.99;
        }
        const start = polarToCartesian(x, y, radius, startAngle);
        const end = polarToCartesian(x, y, radius, endAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
        return `M ${x} ${y} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
    };

    const handleMouseOver = (e: React.MouseEvent, content: string) => {
        if (!svgRef.current) return;
        const CTM = svgRef.current.getScreenCTM();
        if (!CTM) return;
        setTooltip({ content, x: e.clientX, y: e.clientY, visible: true });
    };

    const handleMouseOut = () => {
        setTooltip(prev => ({ ...prev, visible: false }));
    };

    const size = 320;
    const center = size / 2;
    const outerRadius = size / 2 - 10;
    const labelBandWidth = 45; // Was 30, increased by 1.5x
    const innerRadius = outerRadius - labelBandWidth;

    const eventsInClockRange = schedule.filter(event => {
        const eventTime = parseTime(event.time);
        return eventTime >= CLOCK_START_HOUR && eventTime < CLOCK_END_HOUR;
    });

    const clockSectors = useMemo(() => {
        return eventsInClockRange.map((event, index) => {
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

            // Icon position
            const midAngle = startAngle + (endAngle - startAngle) / 2;
            const iconRadius = innerRadius * 0.7; // Position icon inside the sectors
            const iconPos = polarToCartesian(center, center, iconRadius, midAngle);

            return {
                ...event,
                path: describeSector(center, center, innerRadius, startAngle, endAngle),
                color: getColor(event.activity),
                iconPos
            };
        });
    }, [eventsInClockRange]);
    
    // Time labels
    const timeLabels = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
        const hour = CLOCK_START_HOUR + i;
        const angle = timeToAngle(hour);
        const pos = polarToCartesian(center, center, outerRadius - labelBandWidth / 2, angle);
        const isStartEnd = i === 0 || i === TOTAL_HOURS;
        let label = String(hour);
        if (i === 0) label = `${CLOCK_START_HOUR}・${CLOCK_END_HOUR}`;
        if (i === TOTAL_HOURS) label = ''; // Hide the second label

        const markerLength = (hour % 2 === 0) ? 8 : 4;
        const markerInnerPos = polarToCartesian(center, center, outerRadius - markerLength, angle);
        const markerPosEnd = polarToCartesian(center, center, outerRadius, angle);

        return { hour, angle, pos, label, isStartEnd, markerInnerPos, markerPosEnd };
    });

    // Current time hand
    const renderCurrentTimeHand = () => {
        if (!currentTime) return null;
        const currentHourDecimal = currentTime.getHours() + currentTime.getMinutes() / 60;
        if (currentHourDecimal < CLOCK_START_HOUR || currentHourDecimal >= CLOCK_END_HOUR) return null;

        const angle = timeToAngle(currentHourDecimal);
        const endPos = polarToCartesian(center, center, innerRadius, angle);

        return (
            <line
                x1={center}
                y1={center}
                x2={endPos.x}
                y2={endPos.y}
                stroke="#007bff"
                strokeWidth="2"
            />
        );
    };
    
    const sunPos = polarToCartesian(center, center, outerRadius - labelBandWidth/2, -75);
    const moonPos = polarToCartesian(center, center, outerRadius - labelBandWidth/2, -105);

    return (
        <div className="clock-container">
            <svg ref={svgRef} viewBox={`0 0 ${size} ${size}`} width="100%" height="100%">
                {/* Background circle for grey band */}
                <circle cx={center} cy={center} r={outerRadius} fill="#f0f0f0" />
                {/* White circle for inner area, drawn before sectors */}
                <circle cx={center} cy={center} r={innerRadius} fill="white" />

                {/* Sectors for schedule */}
                {clockSectors.map((sector, i) => (
                    <g key={`sector-${i}`}>
                        <path
                            d={sector.path}
                            fill={sector.color}
                            className="clock-sector"
                            onMouseMove={(e) => handleMouseOver(e, `${sector.time}: ${sector.activity}`)}
                            onMouseOut={handleMouseOut}
                        />
                    </g>
                ))}
                
                {/* Time markers and labels */}
                {timeLabels.map(({ hour, angle, pos, label, isStartEnd, markerInnerPos, markerPosEnd }) => (
                    <g key={hour}>
                        {!isStartEnd && <line x1={markerInnerPos.x} y1={markerInnerPos.y} x2={markerPosEnd.x} y2={markerPosEnd.y} stroke="#ccc" strokeWidth="1" />}
                         {label && (
                            <text
                                x={pos.x}
                                y={pos.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontWeight="bold"
                                fontSize="14"
                            >
                                {label}
                            </text>
                        )}
                    </g>
                ))}

                {/* Start/End black line */}
                <line
                    x1={polarToCartesian(center, center, innerRadius, -90).x}
                    y1={polarToCartesian(center, center, innerRadius, -90).y}
                    x2={polarToCartesian(center, center, outerRadius, -90).x}
                    y2={polarToCartesian(center, center, outerRadius, -90).y}
                    stroke="black"
                    strokeWidth="2"
                />

                {/* Sun and Moon Emojis */}
                 <text x={sunPos.x} y={sunPos.y} textAnchor="middle" dominantBaseline="middle" fontSize="16">↑🌞</text>
                 <text x={moonPos.x} y={moonPos.y} textAnchor="middle" dominantBaseline="middle" fontSize="16">↑🌙</text>

                {/* Icons on the sectors */}
                {clockSectors.map((sector, i) => (
                    <text
                        key={`icon-${i}`}
                        x={sector.iconPos.x}
                        y={sector.iconPos.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="20"
                        className="clock-icon"
                    >
                        {sector.icon}
                    </text>
                ))}

                {/* Current time hand */}
                {renderCurrentTimeHand()}
            </svg>
            {tooltip.visible && (
                <div
                    className="schedule-tooltip"
                    style={{ left: `${tooltip.x + 10}px`, top: `${tooltip.y}px` }}
                >
                    {tooltip.content}
                </div>
            )}
        </div>
    );
};


// Timeline View Component
const TimelineView: React.FC<{ schedule: ScheduleEvent[], currentTime: Date | null }> = ({ schedule, currentTime }) => {
    const timelineRef = useRef<HTMLUListElement>(null);
    const indicatorRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const indicator = indicatorRef.current;
        const timeline = timelineRef.current;

        if (!currentTime || !indicator || !timeline || schedule.length < 2) {
            if (indicator) indicator.style.display = 'none';
            return;
        }

        const currentHourDecimal = currentTime.getHours() + currentTime.getMinutes() / 60;

        let prevEventIndex = -1;
        for (let i = 0; i < schedule.length; i++) {
            if (parseTime(schedule[i].time) <= currentHourDecimal) {
                prevEventIndex = i;
            } else {
                break;
            }
        }

        if (prevEventIndex === -1 || prevEventIndex >= schedule.length - 1) {
            indicator.style.display = 'none';
            return;
        }
        
        const nextEventIndex = prevEventIndex + 1;

        const listItems = timeline.children;
        const prevEventElement = listItems[prevEventIndex] as HTMLLIElement;
        const nextEventElement = listItems[nextEventIndex] as HTMLLIElement;

        if (!prevEventElement || !nextEventElement) {
            indicator.style.display = 'none';
            return;
        }

        const prevEventTop = prevEventElement.offsetTop + prevEventElement.offsetHeight / 2;
        const nextEventTop = nextEventElement.offsetTop + nextEventElement.offsetHeight / 2;

        const prevEventTime = parseTime(schedule[prevEventIndex].time);
        const nextEventTime = parseTime(schedule[nextEventIndex].time);

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

    }, [currentTime, schedule]);

    return (
        <ul className="timeline" ref={timelineRef}>
            {schedule.map((item, index) => (
                <li key={index} className="timeline-item">
                    <div className="timeline-time">{item.time}</div>
                    <div className="timeline-icon-wrapper" style={{'--activity-color': getColor(item.activity)} as React.CSSProperties}>
                         <span className="timeline-icon">{item.icon}</span>
                    </div>
                    <div className="timeline-activity">{item.activity}</div>
                </li>
            ))}
             {currentTime && <div className="current-time-indicator" ref={indicatorRef} style={{ display: 'none' }}></div>}
        </ul>
    );
};


// Main App Component
const App: React.FC = () => {
    interface ScheduleSettings {
        milkInterval: number;
        morningNapOffset: number;
        morningNapDuration: number;
        afternoonNap1Offset: number;
        afternoonNap1Duration: number;
        afternoonNap2Offset: number;
        afternoonNap2Duration: number;
        bathOffset: number;
        bathDuration: number;
        bedtimeOffset: number;
    }

    const defaultSettings: ScheduleSettings = {
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

    const [wakeUpTime, setWakeUpTime] = useState<string | null>('07:00');
    const [settings, setSettings] = useState<ScheduleSettings>(defaultSettings);
    const [schedule, setSchedule] = useState<ScheduleEvent[] | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [currentTime, setCurrentTime] = useState<Date | null>(new Date());
    const [isDownloading, setIsDownloading] = useState(false);
    const horizontalCaptureRef = useRef<HTMLDivElement>(null);
    const verticalCaptureRef = useRef<HTMLDivElement>(null);
     
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 60 * 1000); // Update every minute
        return () => clearInterval(timer);
    }, []);

    const generateSchedule = () => {
        if (!wakeUpTime) return;
        setIsLoading(true);
    
        setTimeout(() => {
            const wakeUp = parseTime(wakeUpTime);
            let events: ScheduleEvent[] = [];
            let bathTime: number | null = null;
            let bedtime: number | null = null;
    
            // 1. Generate a long list of potential milk times for the whole day
            let potentialMilkTimes: number[] = [];
            let currentMilkTime = wakeUp;
            while (currentMilkTime < wakeUp + 24) { // Generate for a full 24h cycle to be safe
                potentialMilkTimes.push(currentMilkTime);
                currentMilkTime += settings.milkInterval;
            }
            
            // 2. Find bath time to determine the final bedtime
            const firstMilkAfter5PM = potentialMilkTimes.find(t => t >= 17);
            if (firstMilkAfter5PM) {
                bathTime = firstMilkAfter5PM + settings.bathOffset;
                const bathDuration = settings.bathDuration;
                bedtime = bathTime + bathDuration + settings.bedtimeOffset;
            } else {
                // Fallback bedtime if no milk after 5pm (e.g., very early wakeup)
                bedtime = wakeUp + 14;
            }
    
            // 3. Filter milk times to only include those before the final bedtime
            const milkTimes = potentialMilkTimes.filter(t => t < bedtime);
    
            // 4. Build the final schedule array
            // Wake up
            events.push({ time: formatTime(wakeUp), activity: '起床', icon: '☀️' });
            
            // Milk events
            milkTimes.forEach((milkTime) => {
                events.push({ 
                    time: formatTime(milkTime), 
                    activity: `ミルク`, 
                    icon: '🍼',
                    duration: 0.5 // Each milk feeding is 30 minutes long
                });
            });
    
            // Nap events (based on final milk times)
            if (milkTimes.length > 0) {
                const morningNapStart = milkTimes[0] + settings.morningNapOffset;
                events.push({ time: formatTime(morningNapStart), activity: 'お昼寝', icon: '😴', duration: settings.morningNapDuration });
            }
            if (milkTimes.length > 1) {
                const afternoonNap1Start = milkTimes[1] + settings.afternoonNap1Offset;
                events.push({ time: formatTime(afternoonNap1Start), activity: 'お昼寝', icon: '😴', duration: settings.afternoonNap1Duration });
            }
            if (milkTimes.length > 2) {
                 const afternoonNap2Start = milkTimes[2] + settings.afternoonNap2Offset;
                 events.push({ time: formatTime(afternoonNap2Start), activity: 'お昼寝', icon: '😴', duration: settings.afternoonNap2Duration });
            }
            
            // Bath event
            if (bathTime) {
                events.push({ time: formatTime(bathTime), activity: 'お風呂', icon: '🛁', duration: settings.bathDuration });
            }
            
            // Bedtime event
            events.push({ time: formatTime(bedtime), activity: '就寝', icon: '🌙' });
    
            // Sort all events by time before setting state
            events.sort((a, b) => parseTime(a.time) - parseTime(b.time));
            
            setSchedule(events);
            setIsLoading(false);
        }, 500);
    };


    const shiftSchedule = (minutes: number) => {
        if (!schedule) return;
        const newSchedule = schedule.map(event => {
            const eventTime = parseTime(event.time);
            const newTime = eventTime + minutes / 60;
            return { ...event, time: formatTime(newTime) };
        });
        setSchedule(newSchedule);
    };

    const reset = useCallback(() => {
        setWakeUpTime('07:00');
        setSchedule(null);
        setIsLoading(false);
        setIsSettingsOpen(false); // Close settings on reset
        setSettings(defaultSettings);
    }, []);

    const handleDownload = useCallback(async (layout: 'horizontal' | 'vertical') => {
        const elementToCapture = layout === 'horizontal' ? horizontalCaptureRef.current : verticalCaptureRef.current;
        if (!elementToCapture || isDownloading) return;

        setIsDownloading(true);

        try {
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(elementToCapture, {
                scale: 2,
                backgroundColor: '#FFF9E6',
            });

            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const dateString = `${year}${month}${day}`;

            const link = document.createElement('a');
            link.download = `${dateString}_baby-schedule_${layout}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

        } catch (err) {
            console.error('Image download failed:', err);
            alert('画像の保存に失敗しました。');
        } finally {
            setIsDownloading(false);
        }
    }, [isDownloading]);

    const formattedDate = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][now.getDay()];
        return `${year}年${month}月${day}日(${dayOfWeek})`;
    }, []);

    const WAKE_UP_OPTIONS = ["06:00", "06:30", "07:00", "07:30", "08:00", "08:30"];

    const handleSettingsChange = (field: keyof ScheduleSettings, value: string) => {
        setSettings(s => ({ ...s, [field]: Number(value) }));
    };

    return (
        <div className="container">
            <header className="app-header">
                <h1>赤ちゃん<br />スケジュール</h1>
                <div className="header-buttons">
                    {schedule && (
                        <>
                             <button className="header-icon-btn" onClick={() => handleDownload('horizontal')} disabled={isDownloading} aria-label="横長で画像を保存">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM12 15l-4-4h3V9h2v2h3l-4 4z"/>
                                </svg>
                            </button>
                             <button className="header-icon-btn" onClick={() => handleDownload('vertical')} disabled={isDownloading} aria-label="縦長で画像を保存">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" >
                                    <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2H6zm7 12l-4-4h3V8h2v2h3l-4 4z"/>
                                </svg>
                            </button>
                             <button className="header-icon-btn reset-header-btn" onClick={reset} aria-label="最初からやり直す">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                    <path d="M0 0h24v24H0z" fill="none"/>
                                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                                </svg>
                            </button>
                        </>
                    )}
                    <button className="header-icon-btn settings-btn" onClick={() => setIsSettingsOpen(true)} aria-label="設定">
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
                        </svg>
                    </button>
                </div>
            </header>

            <SettingsPopup isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)}>
                {!schedule ? (
                     <fieldset className="customize-section">
                        <legend>基本設定</legend>
                        <div className="control-group">
                            <label htmlFor="milkInterval">ミルクの間隔 (時間)</label>
                             <input type="number" id="milkInterval" value={settings.milkInterval} onChange={(e) => handleSettingsChange('milkInterval', e.target.value)} min="2" max="5" step="0.5" />
                        </div>
                        <legend>お昼寝の設定</legend>
                        <div className="control-group">
                            <label htmlFor="morningNapOffset">朝寝開始 (最初のミルクから, 時間)</label>
                            <input type="number" id="morningNapOffset" value={settings.morningNapOffset} onChange={(e) => handleSettingsChange('morningNapOffset', e.target.value)} min="0" step="0.5" />
                        </div>
                        <div className="control-group">
                            <label htmlFor="morningNapDuration">朝寝の時間 (時間)</label>
                            <input type="number" id="morningNapDuration" value={settings.morningNapDuration} onChange={(e) => handleSettingsChange('morningNapDuration', e.target.value)} min="0" step="0.5" />
                        </div>
                        <div className="control-group">
                            <label htmlFor="afternoonNap1Offset">昼寝開始 (2回目のミルクから, 時間)</label>
                            <input type="number" id="afternoonNap1Offset" value={settings.afternoonNap1Offset} onChange={(e) => handleSettingsChange('afternoonNap1Offset', e.target.value)} min="0" step="0.5" />
                        </div>
                        <div className="control-group">
                            <label htmlFor="afternoonNap1Duration">昼寝の時間 (時間)</label>
                            <input type="number" id="afternoonNap1Duration" value={settings.afternoonNap1Duration} onChange={(e) => handleSettingsChange('afternoonNap1Duration', e.target.value)} min="0" step="0.5" />
                        </div>
                        <div className="control-group">
                            <label htmlFor="afternoonNap2Offset">夕寝開始 (3回目のミルクから, 時間)</label>
                            <input type="number" id="afternoonNap2Offset" value={settings.afternoonNap2Offset} onChange={(e) => handleSettingsChange('afternoonNap2Offset', e.target.value)} min="0" step="0.5" />
                        </div>
                        <div className="control-group">
                            <label htmlFor="afternoonNap2Duration">夕寝の時間 (時間)</label>
                            <input type="number" id="afternoonNap2Duration" value={settings.afternoonNap2Duration} onChange={(e) => handleSettingsChange('afternoonNap2Duration', e.target.value)} min="0" step="0.5" />
                        </div>
                        <legend>夜の準備</legend>
                        <div className="control-group">
                            <label htmlFor="bathOffset">お風呂開始 (17時以降のミルクから, 時間)</label>
                            <input type="number" id="bathOffset" value={settings.bathOffset} onChange={(e) => handleSettingsChange('bathOffset', e.target.value)} min="0" step="0.5" />
                        </div>
                        <div className="control-group">
                            <label htmlFor="bathDuration">お風呂の時間 (時間)</label>
                            <input type="number" id="bathDuration" value={settings.bathDuration} onChange={(e) => handleSettingsChange('bathDuration', e.target.value)} min="0" step="0.5" />
                        </div>
                        <div className="control-group">
                            <label htmlFor="bedtimeOffset">寝かしつけ (お風呂の後, 時間)</label>
                            <input type="number" id="bedtimeOffset" value={settings.bedtimeOffset} onChange={(e) => handleSettingsChange('bedtimeOffset', e.target.value)} min="0" step="0.5" />
                        </div>
                    </fieldset>
                ) : (
                    <p className="settings-disabled-message">スケジュール作成後に設定は変更できません。やり直す場合はリセットボタンを押してください。</p>
                )}
            </SettingsPopup>

            {!schedule && !isLoading && (
                <div className="controls">
                    <div className="control-group">
                        <label>⏰ 起床時間を選んでね</label>
                        <div className="time-options">
                            {WAKE_UP_OPTIONS.map(time => (
                                <button
                                    key={time}
                                    className={`time-option-btn ${wakeUpTime === time ? 'selected' : ''}`}
                                    onClick={() => setWakeUpTime(time)}
                                >
                                    {time}
                                </button>
                            ))}
                        </div>
                    </div>
                     <button className="generate-btn" onClick={generateSchedule} disabled={!wakeUpTime}>
                        スケジュールを作成する
                    </button>
                </div>
            )}

            <div className="schedule-result">
                {isLoading && <div className="loader"></div>}

                {!isLoading && schedule && (
                    <>
                        {isDownloading && <div className="download-in-progress-indicator">画像を保存中...</div>}

                        <div>
                            <div className="date-controls-container">
                                <div className="schedule-date">{formattedDate}</div>
                                <div className="shift-buttons">
                                    <button className="shift-btn" onClick={() => shiftSchedule(-30)}>-30分</button>
                                    <button className="shift-btn" onClick={() => shiftSchedule(30)}>+30分</button>
                                </div>
                            </div>
                            <div className="both-view-container">
                                <TimelineView schedule={schedule} currentTime={currentTime} />
                                <ClockView schedule={schedule} currentTime={currentTime} />
                            </div>
                        </div>
                    </>
                )}

                {/* This is the off-screen container for image download */}
                {schedule && (
                    <>
                        {/* Horizontal layout for download */}
                        <div ref={horizontalCaptureRef} className="download-image-container">
                            <div className="download-header">{formattedDate}</div>
                            <div className="download-content-wrapper">
                                <div className="download-timeline-col">
                                    <TimelineView schedule={schedule} currentTime={null} />
                                </div>
                                <div className="download-clock-col">
                                    <ClockView schedule={schedule} currentTime={null} />
                                </div>
                            </div>
                        </div>

                        {/* Vertical layout for download */}
                        <div ref={verticalCaptureRef} className="download-image-container download-image-container-vertical">
                            <div className="download-header">{formattedDate}</div>
                            <div className="download-content-wrapper">
                                <div className="download-timeline-col">
                                    <TimelineView schedule={schedule} currentTime={null} />
                                </div>
                                <div className="download-clock-col">
                                    <ClockView schedule={schedule} currentTime={null} />
                                </div>
                            </div>
                        </div>
                    </>
                )}


                {!isLoading && !schedule && (
                    <div className="placeholder">
                        <p>赤ちゃんの起床時間を選ぶと、1日のスケジュールが自動で作成されます。</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}