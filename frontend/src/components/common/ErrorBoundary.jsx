import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('HMS render error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center">
          <h1 className="text-lg font-semibold text-slate-900">The screen failed to load</h1>
          <p className="text-sm text-slate-500 mt-2">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            className="mt-5 w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold"
            onClick={() => {
              this.setState({ error: null });
              window.location.assign('/login');
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }
}
