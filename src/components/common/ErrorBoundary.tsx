import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const isDev = import.meta.env.DEV;

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-lg font-semibold">문제가 발생했습니다</h2>
          <p className="text-sm text-muted-foreground text-center">
            새로고침하거나, 문제가 계속되면 관리자에게 문의하세요.
          </p>
          <div className="flex gap-3">
            <Button onClick={() => window.location.reload()}>새로고침</Button>
            <Button variant="outline" onClick={() => (window.location.href = "/")}>
              홈으로
            </Button>
          </div>
          {isDev && this.state.error && (
            <div className="mt-4 w-full max-w-xl">
              <button
                onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
                className="text-xs text-muted-foreground underline"
              >
                {this.state.showDetails ? "에러 상세 접기" : "에러 상세 펼치기"}
              </button>
              {this.state.showDetails && (
                <pre className="mt-2 text-[10px] bg-muted p-3 rounded overflow-auto max-h-48 text-destructive">
                  {this.state.error.message}
                  {"\n\n"}
                  {this.state.error.stack}
                </pre>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
