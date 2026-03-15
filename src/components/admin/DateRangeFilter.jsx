import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { DateRangePicker } from 'react-date-range';
import { defaultStaticRanges, createStaticRanges } from 'react-date-range';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';

/**
 * Reusable Date Range Filter component.
 *
 * Props:
 *   dateSelection - array with one { startDate, endDate, key } object
 *   setDateSelection - setter for the above
 */
export default function DateRangeFilter({ dateSelection, setDateSelection }) {
    const [showPicker, setShowPicker] = useState(false);
    const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        if (!showPicker) return undefined;

        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setShowPicker(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showPicker]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const start = new Date(dateSelection[0].startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateSelection[0].endDate);
    end.setHours(23, 59, 59, 999);

    const fmt = (d) => d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
    const label = fmt(start) === fmt(end) ? fmt(start) : `${fmt(start)} - ${fmt(end)}`;
    const monthOptions = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();
    const yearOptions = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);
    const yearStaticRanges = createStaticRanges([
        {
            label: 'This Year',
            range: () => {
                const now = new Date();
                return {
                    startDate: new Date(now.getFullYear(), 0, 1),
                    endDate: new Date(now.getFullYear(), 11, 31),
                };
            },
            isSelected(range) {
                const now = new Date();
                const thisYearStart = new Date(now.getFullYear(), 0, 1);
                const thisYearEnd = new Date(now.getFullYear(), 11, 31);
                return (
                    range.startDate.getTime() === thisYearStart.getTime()
                    && range.endDate.getTime() === thisYearEnd.getTime()
                );
            },
        },
        {
            label: 'Last Year',
            range: () => {
                const now = new Date();
                const y = now.getFullYear() - 1;
                return {
                    startDate: new Date(y, 0, 1),
                    endDate: new Date(y, 11, 31),
                };
            },
            isSelected(range) {
                const now = new Date();
                const y = now.getFullYear() - 1;
                const lastYearStart = new Date(y, 0, 1);
                const lastYearEnd = new Date(y, 11, 31);
                return (
                    range.startDate.getTime() === lastYearStart.getTime()
                    && range.endDate.getTime() === lastYearEnd.getTime()
                );
            },
        },
    ]);

    const isTodaySelected = () => {
        const today = new Date();
        return start.getDate() === today.getDate() && start.getMonth() === today.getMonth() && start.getFullYear() === today.getFullYear() &&
            end.getDate() === today.getDate() && end.getMonth() === today.getMonth() && end.getFullYear() === today.getFullYear();
    };

    const handleSetToday = () => {
        setDateSelection([{ startDate: new Date(new Date().setHours(0, 0, 0, 0)), endDate: new Date(), key: 'selection' }]);
    };

    return (
        <div className="bg-white p-1 rounded-xl border border-slate-200 flex flex-wrap items-center shadow-sm gap-2">
            <div className="relative" ref={ref}>
                <button
                    onClick={() => setShowPicker(!showPicker)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                    <Calendar size={16} className="text-slate-500" />
                    <span className="text-sm font-bold min-w-[180px] text-center">{label}</span>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${showPicker ? 'rotate-180' : ''}`} />
                </button>

                {showPicker && (
                    <>
                        <div
                            className="fixed inset-0 bg-black/30 z-[190] md:hidden"
                            onClick={() => setShowPicker(false)}
                        />
                        <div
                            className="fixed inset-x-4 top-20 z-[200] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:absolute md:right-0 md:top-full md:mt-2 md:w-max md:inset-auto"
                            style={{ zIndex: 200 }}
                        >
                            <DateRangePicker
                                onChange={(item) => setDateSelection([item.selection])}
                                showSelectionPreview={true}
                                moveRangeOnFirstSelection={false}
                                months={isMobile ? 1 : 2}
                                ranges={dateSelection}
                                direction={isMobile ? 'vertical' : 'horizontal'}
                                staticRanges={[...defaultStaticRanges, ...yearStaticRanges]}
                                showMonthAndYearPickers={true}
                                navigatorRenderer={(focusedDate, changeShownDate) => (
                                    <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
                                        <select
                                            value={focusedDate.getMonth()}
                                            onChange={(e) => changeShownDate(Number(e.target.value), 'setMonth')}
                                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                                        >
                                            {monthOptions.map((name, index) => (
                                                <option key={`month-${name}`} value={index}>{name}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={focusedDate.getFullYear()}
                                            onChange={(e) => changeShownDate(Number(e.target.value), 'setYear')}
                                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                                        >
                                            {yearOptions.map((year) => (
                                                <option key={`year-${year}`} value={year}>{year}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                className="origin-top-right scale-90 md:scale-100"
                                rangeColors={['#3b82f6']}
                            />
                        </div>
                    </>
                )}
            </div>
            <div className="h-6 w-px bg-slate-200 mx-1"></div>
            <button
                onClick={handleSetToday}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${isTodaySelected() ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
                Today
            </button>
        </div>
    );
}
