import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, MapPin, Building2, Phone, Mail, Calendar, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ESTADOS = [
  { uf: 'AC', nome: 'Acre' }, { uf: 'AL', nome: 'Alagoas' }, { uf: 'AP', nome: 'Amapá' },
  { uf: 'AM', nome: 'Amazonas' }, { uf: 'BA', nome: 'Bahia' }, { uf: 'CE', nome: 'Ceará' },
  { uf: 'DF', nome: 'Distrito Federal' }, { uf: 'ES', nome: 'Espírito Santo' },
  { uf: 'GO', nome: 'Goiás' }, { uf: 'MA', nome: 'Maranhão' }, { uf: 'MT', nome: 'Mato Grosso' },
  { uf: 'MS', nome: 'Mato Grosso do Sul' }, { uf: 'MG', nome: 'Minas Gerais' },
  { uf: 'PA', nome: 'Pará' }, { uf: 'PB', nome: 'Paraíba' }, { uf: 'PR', nome: 'Paraná' },
  { uf: 'PE', nome: 'Pernambuco' }, { uf: 'PI', nome: 'Piauí' }, { uf: 'RJ', nome: 'Rio de Janeiro' },
  { uf: 'RN', nome: 'Rio Grande do Norte' }, { uf: 'RS', nome: 'Rio Grande do Sul' },
  { uf: 'RO', nome: 'Rondônia' }, { uf: 'RR', nome: 'Roraima' }, { uf: 'SC', nome: 'Santa Catarina' },
  { uf: 'SP', nome: 'São Paulo' }, { uf: 'SE', nome: 'Sergipe' }, { uf: 'TO', nome: 'Tocantins' },
];

interface Empresa {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  atividadePrincipal: string;
  naturezaJuridica: string;
  situacaoCadastral: string;
  dataAbertura: string;
  endereco: {
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
    cep: string;
  };
  telefone: string;
  email: string;
  capitalSocial: string;
  porte: string;
  regimeTributario?: string;
  optanteSimples?: boolean;
  optanteSimei?: boolean;
}

interface Municipio {
  id: number;
  nome: string;
}

export default function ProspeccaoEmpresas() {
  const [uf, setUf] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split('T')[0]);
  const [regimeTributario, setRegimeTributario] = useState<string>('todos');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [buscou, setBuscou] = useState(false);

  // Carregar municípios quando UF muda
  useEffect(() => {
    if (!uf) {
      setMunicipios([]);
      setMunicipio('');
      return;
    }

    const carregarMunicipios = async () => {
      try {
        const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
        const data = await res.json();
        setMunicipios(data.map((m: any) => ({ id: m.id, nome: m.nome })));
      } catch {
        toast.error('Erro ao carregar municípios do IBGE');
        setMunicipios([]);
      }
    };

    carregarMunicipios();
  }, [uf]);

  const buscar = useCallback(async () => {
    if (!uf || !municipio || !dataInicio || !dataFim) {
      toast.error('Preencha UF, Município e período');
      return;
    }

    setLoading(true);
    setError('');
    setBuscou(true);

    try {
      const municipioObj = municipios.find((m) => m.nome === municipio);
      const { data, error: fnError } = await supabase.functions.invoke('prospectar-empresas', {
        body: {
          uf,
          municipioId: municipioObj?.id,
          municipio,
          dataInicio,
          dataFim,
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setEmpresas(data.empresas || []);
      if ((data.empresas || []).length === 0) {
        toast.info('Nenhuma empresa encontrada nesse período');
      } else {
        toast.success(`${data.total || data.empresas.length} empresas encontradas`);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar empresas');
      toast.error(err.message || 'Erro ao buscar empresas');
    } finally {
      setLoading(false);
    }
  }, [uf, municipio, dataInicio, dataFim]);

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Buscar Novas Empresas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="space-y-2">
              <Label>Estado (UF)</Label>
              <Select value={uf} onValueChange={setUf}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {ESTADOS.map((e) => (
                    <SelectItem key={e.uf} value={e.uf}>
                      {e.uf} — {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Município</Label>
              <Select value={municipio} onValueChange={setMunicipio} disabled={!uf || municipios.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={uf ? 'Selecione...' : 'Escolha a UF primeiro'} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {municipios.map((m) => (
                    <SelectItem key={m.id} value={m.nome}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data Início</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>

            <Button onClick={buscar} disabled={loading} className="w-full">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Buscar
            </Button>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">{error}</p>
                {error.includes('Token CNPJá') && (
                  <p className="mt-1 text-xs opacity-80">
                    Cadastre-se gratuitamente em{' '}
                    <a href="https://cnpja.com/me" target="_blank" rel="noopener noreferrer" className="underline">
                      cnpja.com/me
                    </a>{' '}
                    e adicione seu token nas configurações do projeto.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Resultados */}
      {buscou && empresas.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {empresas.map((emp, i) => (
            <motion.div
              key={emp.cnpj || i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-sm leading-tight">
                        {emp.razaoSocial || emp.nomeFantasia || 'Nome não informado'}
                      </h3>
                      {emp.nomeFantasia && emp.nomeFantasia !== emp.razaoSocial && (
                        <p className="text-xs text-muted-foreground mt-0.5">{emp.nomeFantasia}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {emp.cnpj}
                    </Badge>
                  </div>

                  {emp.atividadePrincipal && (
                    <p className="text-xs text-muted-foreground">{emp.atividadePrincipal}</p>
                  )}

                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {emp.endereco.logradouro}
                        {emp.endereco.numero ? `, ${emp.endereco.numero}` : ''}
                        {emp.endereco.bairro ? ` — ${emp.endereco.bairro}` : ''}
                        {emp.endereco.cidade ? `, ${emp.endereco.cidade}` : ''}
                        {emp.endereco.uf ? `/${emp.endereco.uf}` : ''}
                      </span>
                    </div>

                    {emp.telefone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{emp.telefone}</span>
                      </div>
                    )}

                    {emp.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{emp.email}</span>
                      </div>
                    )}

                    {emp.dataAbertura && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>Aberta em {new Date(emp.dataAbertura).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t">
                    {emp.capitalSocial && (
                      <Badge variant="secondary" className="text-[10px]">
                        {emp.capitalSocial}
                      </Badge>
                    )}
                    {emp.porte && (
                      <Badge variant="secondary" className="text-[10px]">
                        {emp.porte}
                      </Badge>
                    )}
                    {emp.situacaoCadastral && (
                      <Badge
                        variant={emp.situacaoCadastral === 'Ativa' ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {emp.situacaoCadastral}
                      </Badge>
                    )}
                    {emp.regimeTributario && (
                      <Badge
                        variant={emp.optanteSimei ? 'default' : emp.optanteSimples ? 'default' : 'outline'}
                        className="text-[10px]"
                      >
                        {emp.regimeTributario}
                      </Badge>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs h-8"
                      onClick={() => {
                        navigator.clipboard.writeText(emp.cnpj);
                        toast.success('CNPJ copiado!');
                      }}
                    >
                      Copiar CNPJ
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs h-8"
                      onClick={() => {
                        toast.info('Integração com cadastro de cliente em desenvolvimento');
                      }}
                    >
                      <Building2 className="h-3 w-3 mr-1" />
                      Adicionar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {buscou && !loading && empresas.length === 0 && !error && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p>Nenhuma empresa encontrada para os filtros selecionados.</p>
          <p className="text-sm mt-1">Tente ampliar o período ou verificar outro município.</p>
        </div>
      )}
    </div>
  );
}
