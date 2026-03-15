import { useState, useRef, useEffect } from 'react';
import { DateRange } from 'react-date-range';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
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
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);
    const selection = getSelection(dateSelection);

    useEffect(() => {
        if (!isOpen) return undefined;

        const handleClick = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    const start = selection?.[0]?.startDate ? new Date(selection[0].startDate) : null;
    const end = selection?.[0]?.endDate ? new Date(selection[0].endDate) : null;
    const label = start && end
        ? `${format(start, 'dd.MM.yyyy', { locale: de })} – ${format(end, 'dd.MM.yyyy', { locale: de })}`
        : 'Datum wählen';

    const handleToday = () => {
        const today = new Date();
        setDateSelection?.([{ startDate: today, endDate: today, key: 'selection' }]);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50"
            >
                <CalendarDays size={15} className="text-slate-400" />
                <span>{label}</span>
                <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-[150] bg-black/20 md:hidden"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="fixed inset-x-4 top-20 z-[160] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:absolute md:right-0 md:top-full md:mt-2 md:w-max md:inset-auto">
                        <DateRange
                            editableDateInputs={true}
                            onChange={(item) => setDateSelection?.([item.selection])}
                            moveRangeOnFirstSelection={false}
                            ranges={selection}
                            locale={de}
                            rangeColors={['#2563eb']}
                        />
                        <div className="flex justify-end gap-2 px-4 pb-3">
                            <button
                                type="button"
                                onClick={handleToday}
                                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                            >
                                Heute
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                            >
                                Übernehmen
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
