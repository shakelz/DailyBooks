import React from 'react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("App Crash:", error, errorInfo);
    }

    handleReset = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-200 text-center">
                        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">💥</span>
                        </div>
                        <h1 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h1>
                        <p className="text-sm text-slate-500 mb-6">
                            The application encountered a critical error. Reloading usually resolves transient state issues.
                        </p>
                        <div className="p-3 bg-slate-50 rounded-lg text-left text-xs font-mono text-slate-600 mb-6 overflow-x-auto">
                            {this.state.error?.toString()}
                        </div>
                        <button
                            onClick={this.handleReset}
                            className="w-full py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-500/30"
                        >
                            Reset App Data & Reload
                        </button>
                        <p className="mt-4 text-[10px] text-slate-400">
                            This will reload the app and re-sync data from server.
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
