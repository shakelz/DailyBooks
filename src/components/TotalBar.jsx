import { priceTag } from '../utils/currency';

export default function TotalBar({
    totalIncome = 0, totalExpense = 0, netAmount = 0,
    incomeCount = 0, expenseCount = 0,
    incomeBreakdown = { cash: 0, visa: 0, online: 0 },
    expenseBreakdown = { cash: 0, visa: 0, online: 0 }
}) {
    const toAmount = (value) => parseFloat(value) || 0;

    const hasBreakdownData = (data) => {
        return toAmount(data?.cash) !== 0 || toAmount(data?.visa) !== 0 || toAmount(data?.online) !== 0;
    };

    const normalizedIncomeBreakdown = hasBreakdownData(incomeBreakdown)
        ? {
            cash: toAmount(incomeBreakdown.cash),
            visa: toAmount(incomeBreakdown.visa),
            online: toAmount(incomeBreakdown.online),
        }
        : { cash: toAmount(totalIncome), visa: 0, online: 0 };

    const normalizedExpenseBreakdown = hasBreakdownData(expenseBreakdown)
        ? {
            cash: toAmount(expenseBreakdown.cash),
            visa: toAmount(expenseBreakdown.visa),
            online: toAmount(expenseBreakdown.online),
        }
        : { cash: toAmount(totalExpense), visa: 0, online: 0 };

    const netBreakdown = {
        cash: normalizedIncomeBreakdown.cash - normalizedExpenseBreakdown.cash,
        visa: normalizedIncomeBreakdown.visa - normalizedExpenseBreakdown.visa,
        online: normalizedIncomeBreakdown.online - normalizedExpenseBreakdown.online,
    };

    const Tooltip = ({ data, title }) => {
        const total = toAmount(data.cash) + toAmount(data.visa) + toAmount(data.online);

        return (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-52 p-3 bg-slate-900/95 text-white rounded-2xl shadow-2xl opacity-0 scale-95 translate-y-2 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0 pointer-events-none transition-all duration-300 ease-out z-[110] border border-slate-700/60 backdrop-blur-md">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-800 pb-1">{title}</p>
                <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Cash</span>
                        <span className={`font-mono font-bold ${data.cash >= 0 ? 'text-emerald-400' : 'text-orange-400'}`}>{priceTag(data.cash)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Visa</span>
                        <span className={`font-mono font-bold ${data.visa >= 0 ? 'text-emerald-400' : 'text-orange-400'}`}>{priceTag(data.visa)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Online</span>
                        <span className={`font-mono font-bold ${data.online >= 0 ? 'text-emerald-400' : 'text-orange-400'}`}>{priceTag(data.online)}</span>
                    </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-semibold">Total</span>
                    <span className={`font-mono font-black ${total >= 0 ? 'text-emerald-400' : 'text-orange-400'}`}>{priceTag(total)}</span>
                </div>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-slate-900/95" />
            </div>
        );
    };

    return (
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex-shrink-0">
            <div className="grid grid-cols-3 gap-3">
                {/* Total Sale */}
                <div className="relative overflow-visible rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 p-4 group hover:shadow-lg hover:shadow-emerald-500/15 hover:-translate-y-0.5 transition-all duration-300 cursor-help">
                    <Tooltip data={normalizedIncomeBreakdown} title="Income Breakdown" />
                    <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-emerald-200/30 group-hover:scale-110 transition-transform" />
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                </svg>
                            </div>
                            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Today's Sale</span>
                        </div>
                        <p className="text-xl sm:text-2xl font-black text-emerald-700">{priceTag(totalIncome)}</p>
                        <p className="text-[10px] text-emerald-500 mt-0.5">{incomeCount} transactions</p>
                    </div>
                </div>

                {/* Total Purchase */}
                <div className="relative overflow-visible rounded-2xl bg-gradient-to-br from-red-50 to-red-100/50 border border-red-200 p-4 group hover:shadow-lg hover:shadow-red-500/15 hover:-translate-y-0.5 transition-all duration-300 cursor-help">
                    <Tooltip data={normalizedExpenseBreakdown} title="Expense Breakdown" />
                    <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-red-200/30 group-hover:scale-110 transition-transform" />
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                                </svg>
                            </div>
                            <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Total Purchase</span>
                        </div>
                        <p className="text-xl sm:text-2xl font-black text-red-700">{priceTag(totalExpense)}</p>
                        <p className="text-[10px] text-red-500 mt-0.5">{expenseCount} transactions</p>
                    </div>
                </div>

                {/* Net Amount */}
                <div className={`relative overflow-visible rounded-2xl border p-4 group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-help ${netAmount >= 0
                    ? 'bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200 hover:shadow-blue-500/15'
                    : 'bg-gradient-to-br from-orange-50 to-orange-100/50 border-orange-200 hover:shadow-orange-500/15'
                    }`}>
                    <Tooltip data={netBreakdown} title="Net Breakdown" />
                    <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full ${netAmount >= 0 ? 'bg-blue-200/30' : 'bg-orange-200/30'} group-hover:scale-110 transition-transform`} />
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-1">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${netAmount >= 0 ? 'bg-blue-500' : 'bg-orange-500'}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${netAmount >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                                Net Amount
                            </span>
                        </div>
                        <p className={`text-xl sm:text-2xl font-black ${netAmount >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                            {priceTag(netAmount)}
                        </p>
                        <p className={`text-[10px] mt-0.5 ${netAmount >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>
                            {netAmount >= 0 ? 'Profit' : 'Loss'} today
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
