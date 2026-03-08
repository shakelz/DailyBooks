import { Component } from 'react';

class SalesmanDashboardErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            errorMessage: '',
            retryToken: 0,
        };
        this.handleReset = this.handleReset.bind(this);
    }

    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            errorMessage: String(error?.message || 'Dashboard crashed unexpectedly.'),
        };
    }

    componentDidCatch(error, info) {
        console.error('SalesmanDashboardErrorBoundary', error, info);
    }

    handleReset() {
        this.setState((prev) => ({
            hasError: false,
            errorMessage: '',
            retryToken: prev.retryToken + 1,
        }));
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
                    <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-lg">
                        <h2 className="text-lg font-black text-rose-700">Dashboard Error</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            {this.state.errorMessage || 'Something went wrong while rendering the dashboard.'}
                        </p>
                        <button
                            type="button"
                            onClick={this.handleReset}
                            className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                        >
                            Reset Dashboard
                        </button>
                    </div>
                </div>
            );
        }

        return <div key={this.state.retryToken}>{this.props.children}</div>;
    }
}

export default SalesmanDashboardErrorBoundary;
