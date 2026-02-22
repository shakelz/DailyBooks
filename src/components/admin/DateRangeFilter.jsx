import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { DateRangePicker } from 'react-date-range';
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
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setShowPicker(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const start = new Date(dateSelection[0].startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateSelection[0].endDate);
    end.setHours(23, 59, 59, 999);

    const fmt = (d) => d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
    const label = fmt(start) === fmt(end) ? fmt(start) : `${fmt(start)} — ${fmt(end)}`;

    const isTodaySelected = () => {
        const today = new Date();
        return start.getDate() === today.getDate() && start.getMonth() === today.getMonth() && start.getFullYear() === today.getFullYear() &&
            end.getDate() === today.getDate() && end.getMonth() === today.getMonth() && end.getFullYear() === today.getFullYear();
    };

    const handleSetToday = () => {
        setDateSelection([{ startDate: new Date(new Date().setHours(0, 0, 0, 0)), endDate: new Date(), key: 'selection' }]);
    };

    return (
        <div className="bg-white p-1 rounded-xl border border-slate-200 flex flex-wrap items-center shadow-sm gap-2 relative" ref={ref}>
            <button
                onClick={() => setShowPicker(!showPicker)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
                <Calendar size={16} className="text-slate-500" />
                <span className="text-sm font-bold min-w-[180px] text-center">{label}</span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${showPicker ? 'rotate-180' : ''}`} />
            </button>

            {showPicker && (
                <div className="absolute top-full right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden">
                    <DateRangePicker
                        onChange={item => setDateSelection([item.selection])}
                        showSelectionPreview={true}
                        moveRangeOnFirstSelection={false}
                        months={2}
                        ranges={dateSelection}
                        direction="horizontal"
                        className="scale-90 origin-top-right md:scale-100"
                        rangeColors={['#3b82f6']}
                    />
                </div>
            )}

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
