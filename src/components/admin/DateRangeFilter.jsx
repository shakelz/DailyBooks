import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { DateRangePicker } from 'react-date-range';
import { defaultStaticRanges, createStaticRanges } from 'react-date-range';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';

function getSelection(dateSelection = []) {
    if (Array.isArray(dateSelection) && dateSelection[0]) {
        return dateSelection;
    }

    const today = new Date();
    return [{ startDate: today, endDate: today, key: 'selection' }];
}

export default function DateRangeFilter({ dateSelection, setDateSelection }) {
    const [showPicker, setShowPicker] = useState(false);
    const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
    const ref = useRef(null);
    const selection = getSelection(dateSelection);

    useEffect(() => {
        if (!showPicker) return undefined;

        const handler = (event) => {
            if (ref.current && !ref.current.contains(event.target)) {
                setShowPicker(false);
            }
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

    const start = new Date(selection[0].startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selection[0].endDate);
    end.setHours(23, 59, 59, 999);

    const fmt = (value) => value.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
    const label = fmt(start) === fmt(end) ? fmt(start) : `${fmt(start)} - ${fmt(end)}`;
    const monthOptions = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const currentYear = new Date().getFullYear();
    const yearOptions = Array.from({ length: 21 }, (_, index) => currentYear - 10 + index);
    const yearStaticRanges = createStaticRanges([
        {
            label: 'Dieses Jahr',
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
            label: 'Letztes Jahr',
            range: () => {
                const now = new Date();
                const year = now.getFullYear() - 1;
                return {
                    startDate: new Date(year, 0, 1),
                    endDate: new Date(year, 11, 31),
                };
            },
            isSelected(range) {
                const now = new Date();
                const year = now.getFullYear() - 1;
                const lastYearStart = new Date(year, 0, 1);
                const lastYearEnd = new Date(year, 11, 31);
                return (
                    range.startDate.getTime() === lastYearStart.getTime()
                    && range.endDate.getTime() === lastYearEnd.getTime()
                );
            },
        },
    ]);

    const isTodaySelected = () => {
        const today = new Date();
        return start.getDate() === today.getDate()
            && start.getMonth() === today.getMonth()
            && start.getFullYear() === today.getFullYear()
            && end.getDate() === today.getDate()
            && end.getMonth() === today.getMonth()
            && end.getFullYear() === today.getFullYear();
    };

    const handleSetToday = () => {
        setDateSelection?.([{ startDate: new Date(new Date().setHours(0, 0, 0, 0)), endDate: new Date(), key: 'selection' }]);
    };

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <div className="relative" ref={ref}>
                <button
                    type="button"
                    onClick={() => setShowPicker((prev) => !prev)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-slate-700 transition-colors hover:bg-slate-100"
                >
                    <Calendar size={16} className="text-slate-500" />
                    <span className="min-w-[180px] text-center text-sm font-bold">{label}</span>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${showPicker ? 'rotate-180' : ''}`} />
                </button>

                {showPicker && (
                    <>
                        <div
                            className="fixed inset-0 z-[190] bg-black/30 md:hidden"
                            onClick={() => setShowPicker(false)}
                        />
                        <div
                            className="fixed inset-x-4 top-20 z-[200] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:absolute md:right-0 md:top-full md:mt-2 md:w-max md:inset-auto"
                            style={{ zIndex: 200 }}
                        >
                            <DateRangePicker
                                onChange={(item) => setDateSelection?.([item.selection])}
                                showSelectionPreview={true}
                                moveRangeOnFirstSelection={false}
                                months={isMobile ? 1 : 2}
                                ranges={selection}
                                direction={isMobile ? 'vertical' : 'horizontal'}
                                staticRanges={[...defaultStaticRanges, ...yearStaticRanges]}
                                showMonthAndYearPickers={true}
                                navigatorRenderer={(focusedDate, changeShownDate) => (
                                    <div className="flex items-center justify-end gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                                        <select
                                            value={focusedDate.getMonth()}
                                            onChange={(event) => changeShownDate(Number(event.target.value), 'setMonth')}
                                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                                        >
                                            {monthOptions.map((name, index) => (
                                                <option key={`month-${name}`} value={index}>{name}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={focusedDate.getFullYear()}
                                            onChange={(event) => changeShownDate(Number(event.target.value), 'setYear')}
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
            <div className="mx-1 h-6 w-px bg-slate-200" />
            <button
                type="button"
                onClick={handleSetToday}
                className={`cursor-pointer rounded-lg px-4 py-2 text-xs font-bold transition-colors ${isTodaySelected() ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
                Heute
            </button>
        </div>
    );
}
