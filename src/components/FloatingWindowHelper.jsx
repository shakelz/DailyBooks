import { useState, useRef } from 'react';
import Draggable from 'react-draggable';
import { priceTag } from '../utils/currency';

function FloatingWindow({ title, icon, children, defaultPosition, onClose, accentColor = 'blue' }) {
    const [minimized, setMinimized] = useState(false);
    const nodeRef = useRef(null);

    return (
        <Draggable
            handle=".drag-handle"
            defaultPosition={defaultPosition || { x: 0, y: 0 }}
            bounds="parent"
            nodeRef={nodeRef}
        >
            <div ref={nodeRef} className="fixed z-[100]" style={{ width: minimized ? 220 : 320 }}>
                <div className="rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 shadow-2xl shadow-black/40 overflow-hidden">
                    {/* Title Bar (draggable via handle class) */}
                    <div className="drag-handle flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50 cursor-grab active:cursor-grabbing select-none">
                        <div className="flex items-center gap-2">
                            <span className={accentColor === 'blue' ? 'text-blue-400' : 'text-amber-400'}>{icon}</span>
                            <span className="text-sm font-semibold text-white">{title}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setMinimized(!minimized)}
                                className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-700/60 transition-all cursor-pointer"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={minimized ? "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" : "M20 12H4"} />
                                </svg>
                            </button>
                            <button
                                onClick={onClose}
                                className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    {!minimized && (
                        <div className="p-4">{children}</div>
                    )}
                </div>
            </div>
        </Draggable>
    );
}

// ── Calculator Widget ──
function Calculator() {
    const [display, setDisplay] = useState('0');
    const [prev, setPrev] = useState(null);
    const [op, setOp] = useState(null);
    const [reset, setReset] = useState(false);

    const handleNumber = (num) => {
        if (reset) { setDisplay(String(num)); setReset(false); }
        else { setDisplay(display === '0' ? String(num) : display + num); }
    };

    const handleOp = (newOp) => {
        setPrev(parseFloat(display));
        setOp(newOp);
        setReset(true);
    };

    const handleEquals = () => {
        if (prev === null || !op) return;
        const curr = parseFloat(display);
        let result = 0;
        switch (op) {
            case '+': result = prev + curr; break;
            case '-': result = prev - curr; break;
            case '×': result = prev * curr; break;
            case '÷': result = curr !== 0 ? prev / curr : 0; break;
        }
        setDisplay(String(Math.round(result * 100) / 100));
        setPrev(null); setOp(null); setReset(true);
    };

    const handleClear = () => {
        setDisplay('0'); setPrev(null); setOp(null); setReset(false);
    };

    const buttons = [
        ['7', '8', '9', '÷'],
        ['4', '5', '6', '×'],
        ['1', '2', '3', '-'],
        ['C', '0', '=', '+'],
    ];

    return (
        <div>
            <div className="bg-slate-800/80 rounded-xl px-4 py-3 mb-3 text-right border border-slate-700/50">
                <p className="text-xs text-slate-500">{prev !== null ? `${prev} ${op}` : '\u00A0'}</p>
                <p className="text-2xl font-bold text-white font-mono">{display}</p>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
                {buttons.flat().map((btn) => {
                    const isOp = ['÷', '×', '-', '+'].includes(btn);
                    const isEquals = btn === '=';
                    const isClear = btn === 'C';
                    return (
                        <button
                            key={btn}
                            onClick={() => {
                                if (isClear) handleClear();
                                else if (isEquals) handleEquals();
                                else if (isOp) handleOp(btn);
                                else handleNumber(btn);
                            }}
                            className={`h-10 rounded-lg text-sm font-semibold transition-all active:scale-95 cursor-pointer
                ${isEquals ? 'bg-blue-500 text-white hover:bg-blue-400' : ''}
                ${isOp ? 'bg-slate-700/80 text-blue-400 hover:bg-slate-600/80' : ''}
                ${isClear ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : ''}
                ${!isOp && !isEquals && !isClear ? 'bg-slate-800/60 text-white hover:bg-slate-700/60 border border-slate-700/40' : ''}
              `}
                        >
                            {btn}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ── Recent Transactions Widget ──
function RecentTransactions({ transactions = [] }) {
    const displayTxns = transactions.length > 0 ? transactions : [
        { type: 'income', desc: 'Samsung Galaxy A55 Sale', amount: 28500, time: '10:30 AM' },
        { type: 'expense', desc: 'Screen Guard Purchase', amount: 2500, time: '09:45 AM' },
        { type: 'income', desc: 'iPhone Cover Sale', amount: 450, time: '09:20 AM' },
        { type: 'expense', desc: 'Chai + Nashta', amount: 120, time: '09:00 AM' },
    ];

    return (
        <div className="space-y-2 max-h-64 overflow-y-auto">
            {displayTxns.map((txn, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/40">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${txn.type === 'income' ? 'bg-emerald-500/20' : 'bg-red-500/20'
                            }`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 ${txn.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={txn.type === 'income' ? "M7 11l5-5m0 0l5 5m-5-5v12" : "M17 13l-5 5m0 0l-5-5m5 5V6"} />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-white truncate">{txn.desc}</p>
                            <p className="text-[10px] text-slate-500">{txn.time}</p>
                        </div>
                    </div>
                    <span className={`text-xs font-bold flex-shrink-0 ml-2 ${txn.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {txn.type === 'income' ? '+' : '-'}{priceTag(txn.amount)}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ── Main Export ──
export default function FloatingWindowHelper({ transactions = [] }) {
    const [showCalc, setShowCalc] = useState(false);
    const [showTxns, setShowTxns] = useState(false);

    return (
        <>
            {/* Toggle FAB Buttons (fixed bottom-right) */}
            <div className="fixed bottom-6 right-6 z-[90] flex flex-col gap-2">
                <button
                    onClick={() => setShowCalc(!showCalc)}
                    id="toggle-calculator"
                    className={`group w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 cursor-pointer
            ${showCalc
                            ? 'bg-blue-500 text-white shadow-blue-500/30 scale-110'
                            : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700 hover:shadow-xl'
                        }`}
                    title="Calculator"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                </button>
                <button
                    onClick={() => setShowTxns(!showTxns)}
                    id="toggle-transactions"
                    className={`group w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 cursor-pointer
            ${showTxns
                            ? 'bg-amber-500 text-white shadow-amber-500/30 scale-110'
                            : 'bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700 hover:shadow-xl'
                        }`}
                    title="Recent Transactions"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                </button>
            </div>

            {/* Floating Windows (react-draggable powered) */}
            {showCalc && (
                <FloatingWindow
                    title="Calculator"
                    accentColor="blue"
                    defaultPosition={{ x: window.innerWidth - 400, y: 80 }}
                    onClose={() => setShowCalc(false)}
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                    }
                >
                    <Calculator />
                </FloatingWindow>
            )}

            {showTxns && (
                <FloatingWindow
                    title="Recent Transactions"
                    accentColor="amber"
                    defaultPosition={{ x: window.innerWidth - 400, y: 360 }}
                    onClose={() => setShowTxns(false)}
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                    }
                >
                    <RecentTransactions transactions={transactions} />
                </FloatingWindow>
            )}
        </>
    );
}
