import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from '@/components/icons';
import { Button } from '@/components/ui/button';

type Props = { children: ReactNode };
type State = { error: Error | null; info: ErrorInfo | null };

/**
 * Captura erros de renderização da árvore React abaixo dele e mostra uma
 * mensagem em vez de deixar a aplicação inteira em tela branca.
 *
 * Só pega erro durante a renderização — erro dentro de `async`/`setTimeout`
 * ou de handler de evento não passa por aqui.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
    this.setState({ info });
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded-lg border border-destructive/30 bg-destructive/5 p-6 space-y-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="font-semibold">Algo deu errado nesta tela</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Um erro impediu o carregamento. A mensagem abaixo ajuda a identificar a causa:
          </p>
          <pre className="text-xs bg-background border rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap break-words">
            {this.state.error.message}
            {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
          </pre>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => location.reload()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Recarregar página
            </Button>
            <Button size="sm" onClick={this.reset}>Tentar novamente</Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
