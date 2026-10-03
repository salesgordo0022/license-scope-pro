import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Atalho "+ Novo" da barra superior: a tela é aberta com `?novo=1` e, assim que
 * estiver pronta (dados carregados), abre o formulário de criação. O parâmetro
 * sai da URL para o formulário não reabrir num refresh.
 */
export function useAbrirNovo(abrir: () => void, pronto: boolean) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (!pronto || params.get('novo') === null) return;
    abrir();
    const resto = new URLSearchParams(params);
    resto.delete('novo');
    setParams(resto, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, params]);
}
