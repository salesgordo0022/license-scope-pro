/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MapPin, Loader2, Navigation, Search, X, Route as RouteIcon, Locate } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Cliente = {
  id: string;
  nome_empresa: string;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  status: string | null;
  cnpj: string | null;
  telefone: string | null;
};

type Geocoded = Cliente & { lat: number; lng: number; addressFull: string };

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string;
const CHANNEL = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string;

let mapsPromise: Promise<typeof google> | null = null;
function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === 'undefined') return Promise.reject('SSR');
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    (window as any).__initGmaps = () => resolve((window as any).google);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&loading=async&callback=__initGmaps&libraries=places,geometry&channel=${CHANNEL}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error('Falha ao carregar Google Maps'));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

/**
 * Rotas & GPS: plota os clientes num mapa e monta o roteiro de visitas.
 *
 * A geocodificação roda na Edge Function `geocode-clientes` para manter as
 * chaves da API do Google fora do navegador. A chave usada aqui é só a
 * "browser key" do mapa, que precisa estar restrita por domínio no Google
 * Cloud Console — sem essa restrição, qualquer site pode usá-la.
 */
export default function Rotas() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [geocoded, setGeocoded] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const [loadingMap, setLoadingMap] = useState(true);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [cidadeFiltro, setCidadeFiltro] = useState<string>('todas');
  const [statusFiltro, setStatusFiltro] = useState<string>('todos');
  const [origem, setOrigem] = useState<{ lat: number; lng: number } | null>(null);
  const [resumoRota, setResumoRota] = useState<{ distancia: string; duracao: string } | null>(null);
  const [calculando, setCalculando] = useState(false);

  // Carrega clientes
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome_empresa, endereco, cidade, estado, status, cnpj, telefone')
        .order('nome_empresa');
      if (error) {
        toast.error('Erro ao carregar clientes');
      } else {
        setClientes((data || []) as Cliente[]);
      }
      setLoadingClientes(false);
    })();
  }, []);

  // Inicializa mapa
  useEffect(() => {
    if (!BROWSER_KEY) {
      toast.error('Google Maps não configurado');
      setLoadingMap(false);
      return;
    }
    loadGoogleMaps()
      .then((g) => {
        if (!mapRef.current) return;
        mapInstance.current = new g.maps.Map(mapRef.current, {
          center: { lat: -14.235, lng: -51.9253 }, // Brasil
          zoom: 4,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        geocoderRef.current = new g.maps.Geocoder();
        directionsRenderer.current = new g.maps.DirectionsRenderer({
          map: mapInstance.current,
          suppressMarkers: false,
          polylineOptions: { strokeColor: 'hsl(var(--primary))', strokeWeight: 5 },
        });
        setLoadingMap(false);
      })
      .catch((e) => {
        toast.error(e.message || 'Erro ao carregar mapa');
        setLoadingMap(false);
      });
  }, []);

  const cidadesUnicas = useMemo(() => {
    const s = new Set<string>();
    clientes.forEach((c) => c.cidade && s.add(c.cidade));
    return Array.from(s).sort();
  }, [clientes]);

  const clientesFiltrados = useMemo(() => {
    const b = busca.toLowerCase().trim();
    return clientes.filter((c) => {
      if (cidadeFiltro !== 'todas' && c.cidade !== cidadeFiltro) return false;
      if (statusFiltro !== 'todos' && c.status !== statusFiltro) return false;
      if (b) {
        const hay = `${c.nome_empresa} ${c.cnpj ?? ''} ${c.cidade ?? ''} ${c.endereco ?? ''}`.toLowerCase();
        if (!hay.includes(b)) return false;
      }
      // só faz sentido se tem algum endereço
      return !!(c.endereco || c.cidade);
    });
  }, [clientes, busca, cidadeFiltro, statusFiltro]);

  const enderecoCompleto = (c: Cliente) =>
    [c.endereco, c.cidade, c.estado, 'Brasil'].filter(Boolean).join(', ');

  // Geocodifica em lote via edge function (Places API New — pesquisa por nome + endereço)
  const geocodeBatch = useCallback(
    async (lista: Cliente[]) => {
      const result = new Map(geocoded);
      const pendentes = lista.filter((c) => !result.has(c.id));
      if (pendentes.length === 0) return result;
      setGeocoding(true);
      try {
        // processa em chunks de 25
        for (let i = 0; i < pendentes.length; i += 25) {
          const chunk = pendentes.slice(i, i + 25).map((c) => ({
            id: c.id,
            nome: c.nome_empresa,
            endereco: c.endereco ?? undefined,
            cidade: c.cidade ?? undefined,
            estado: c.estado ?? undefined,
          }));
          const { data, error } = await supabase.functions.invoke('geocode-clientes', {
            body: { items: chunk },
          });
          if (error) {
            console.error('geocode error', error);
            continue;
          }
          if (data?.success && Array.isArray(data.results)) {
            for (const r of data.results) {
              if (r.lat != null && r.lng != null) {
                result.set(r.id, { lat: r.lat, lng: r.lng });
              }
            }
          }
        }
      } finally {
        setGeocoded(new Map(result));
        setGeocoding(false);
      }
      return result;
    },
    [geocoded]
  );


  // Quando lista filtrada mudar, geocodifica e desenha marcadores
  useEffect(() => {
    if (loadingMap || !mapInstance.current) return;
    (async () => {
      const coords = await geocodeBatch(clientesFiltrados);
      // Limpa marcadores antigos
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      const bounds = new google.maps.LatLngBounds();
      let count = 0;
      clientesFiltrados.forEach((c) => {
        const pos = coords.get(c.id);
        if (!pos) return;
        const selecionado = selecionados.has(c.id);
        const marker = new google.maps.Marker({
          position: pos,
          map: mapInstance.current!,
          title: c.nome_empresa,
          label: selecionado ? { text: '✓', color: '#fff', fontWeight: 'bold' } : undefined,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: selecionado ? 12 : 8,
            fillColor: selecionado ? '#16a34a' : '#3b82f6',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        });
        marker.addListener('click', () => {
          setSelecionados((prev) => {
            const n = new Set(prev);
            if (n.has(c.id)) n.delete(c.id);
            else n.add(c.id);
            return n;
          });
        });
        markersRef.current.push(marker);
        bounds.extend(pos);
        count++;
      });
      if (count > 0 && !directionsRenderer.current?.getDirections()) {
        mapInstance.current!.fitBounds(bounds, 60);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesFiltrados, loadingMap, selecionados]);

  const usarMinhaLocalizacao = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalização não disponível neste navegador');
      return;
    }
    if (!window.isSecureContext) {
      toast.error('Geolocalização requer HTTPS. Abra o app publicado.');
      return;
    }
    const loadingToast = toast.loading('Obtendo sua localização...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast.dismiss(loadingToast);
        setOrigem({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success(`Localização capturada (±${Math.round(pos.coords.accuracy)}m)`);
        if (mapInstance.current) {
          mapInstance.current.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          mapInstance.current.setZoom(13);
        }
      },
      (err) => {
        toast.dismiss(loadingToast);
        const msgs: Record<number, string> = {
          1: 'Permissão negada. Libere a localização no ícone de cadeado da barra de endereço e recarregue.',
          2: 'Localização indisponível. Verifique se o GPS/Wi-Fi está ativo.',
          3: 'Tempo esgotado. Tentando modo de baixa precisão...',
        };
        toast.error(msgs[err.code] || `Erro (${err.code}): ${err.message}`);
        if (err.code === 3 || err.code === 2) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setOrigem({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              toast.success('Localização aproximada capturada');
              if (mapInstance.current) {
                mapInstance.current.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                mapInstance.current.setZoom(12);
              }
            },
            () => {},
            { enableHighAccuracy: false, timeout: 25000, maximumAge: 300000 }
          );
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  /** Calcula o trajeto entre os clientes selecionados, na ordem escolhida. */
  const calcularRota = async () => {
    if (!origem) {
      toast.error('Capture sua localização primeiro');
      return;
    }
    const escolhidos = clientesFiltrados.filter((c) => selecionados.has(c.id));
    if (escolhidos.length === 0) {
      toast.error('Selecione ao menos 1 cliente');
      return;
    }
    const coords = geocoded;
    const validos = escolhidos.filter((c) => coords.has(c.id));
    if (validos.length === 0) {
      toast.error('Endereços ainda sendo localizados, aguarde');
      return;
    }
    setCalculando(true);
    try {
      const svc = new google.maps.DirectionsService();
      const destino = coords.get(validos[validos.length - 1].id)!;
      const waypoints = validos.slice(0, -1).map((c) => ({
        location: coords.get(c.id)!,
        stopover: true,
      }));
      const res = await svc.route({
        origin: origem,
        destination: destino,
        waypoints,
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING,
      });
      directionsRenderer.current!.setDirections(res);
      // Calcula totais
      const legs = res.routes[0].legs;
      const distM = legs.reduce((s, l) => s + (l.distance?.value || 0), 0);
      const durS = legs.reduce((s, l) => s + (l.duration?.value || 0), 0);
      setResumoRota({
        distancia: `${(distM / 1000).toFixed(1)} km`,
        duracao: `${Math.round(durS / 60)} min`,
      });
      toast.success('Rota otimizada!');
    } catch (e: any) {
      toast.error('Erro ao calcular rota: ' + (e.message || ''));
    } finally {
      setCalculando(false);
    }
  };

  /** Limpa o trajeto traçado e a seleção atual. */
  const limparRota = () => {
    directionsRenderer.current?.setDirections({ routes: [] } as any);
    setResumoRota(null);
  };

  /** Abre a rota montada no aplicativo do Google Maps, para navegação. */
  const abrirNoGoogleMaps = () => {
    if (!origem) return toast.error('Capture sua localização primeiro');
    const escolhidos = clientesFiltrados.filter((c) => selecionados.has(c.id));
    if (escolhidos.length === 0) return toast.error('Selecione clientes');
    const coords = geocoded;
    const wp = escolhidos
      .map((c) => coords.get(c.id))
      .filter(Boolean) as { lat: number; lng: number }[];
    if (wp.length === 0) return;
    const destino = wp[wp.length - 1];
    const intermed = wp.slice(0, -1).map((p) => `${p.lat},${p.lng}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origem.lat},${origem.lng}&destination=${destino.lat},${destino.lng}${intermed ? `&waypoints=${intermed}` : ''}&travelmode=driving`;
    window.open(url, '_blank');
  };

  /** Marca ou desmarca todos os clientes da lista. */
  const toggleAll = () => {
    if (selecionados.size === clientesFiltrados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(clientesFiltrados.map((c) => c.id)));
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RouteIcon className="h-6 w-6 text-primary" />
            Rotas & GPS
          </h1>
          <p className="text-sm text-muted-foreground">
            Visualize clientes no mapa e monte rotas otimizadas para suas visitas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={usarMinhaLocalizacao}>
            <Locate className="h-4 w-4 mr-2" />
            {origem ? 'Localização OK' : 'Minha localização'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {/* Painel lateral */}
        <Card className="h-[calc(100vh-200px)] flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clientes para visitar</CardTitle>
            <div className="space-y-2 pt-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={cidadeFiltro} onValueChange={setCidadeFiltro}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Cidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas cidades</SelectItem>
                    {cidadesUnicas.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos status</SelectItem>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {clientesFiltrados.length} clientes
                  {geocoding && <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />}
                </span>
                <button
                  onClick={toggleAll}
                  className="text-primary hover:underline"
                >
                  {selecionados.size === clientesFiltrados.length && clientesFiltrados.length > 0
                    ? 'Limpar seleção'
                    : 'Selecionar todos'}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full px-4">
              {loadingClientes ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : clientesFiltrados.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  Nenhum cliente com endereço
                </p>
              ) : (
                <div className="space-y-1 pb-4">
                  {clientesFiltrados.map((c) => {
                    const isSel = selecionados.has(c.id);
                    const hasCoord = geocoded.has(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-start gap-2 p-2 rounded-md cursor-pointer hover:bg-muted/60 ${
                          isSel ? 'bg-primary/5 border border-primary/30' : 'border border-transparent'
                        }`}
                      >
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={(v) => {
                            setSelecionados((prev) => {
                              const n = new Set(prev);
                              if (v) n.add(c.id);
                              else n.delete(c.id);
                              return n;
                            });
                          }}
                          className="mt-0.5"
                        />
                        <div
                          className="flex-1 min-w-0"
                          onClick={(e) => {
                            e.preventDefault();
                            const pos = geocoded.get(c.id);
                            if (pos && mapInstance.current) {
                              mapInstance.current.setCenter(pos);
                              mapInstance.current.setZoom(15);
                            }
                          }}
                        >
                          <p className="text-sm font-medium truncate">{c.nome_empresa}</p>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {c.cidade || '—'}
                            {c.estado ? `/${c.estado}` : ''}
                          </p>
                          {!hasCoord && !geocoding && (
                            <Badge variant="outline" className="text-[9px] mt-0.5">
                              sem coordenadas
                            </Badge>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Mapa */}
        <Card className="h-[calc(100vh-200px)] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b bg-muted/30 flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{selecionados.size} selecionados</Badge>
              {resumoRota && (
                <>
                  <Badge variant="default">{resumoRota.distancia}</Badge>
                  <Badge variant="default">{resumoRota.duracao}</Badge>
                </>
              )}
            </div>
            <div className="flex gap-2">
              {resumoRota && (
                <Button size="sm" variant="ghost" onClick={limparRota}>
                  <X className="h-4 w-4 mr-1" /> Limpar rota
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={abrirNoGoogleMaps} disabled={selecionados.size === 0}>
                <Navigation className="h-4 w-4 mr-1" /> Abrir no GPS
              </Button>
              <Button size="sm" onClick={calcularRota} disabled={calculando || selecionados.size === 0}>
                {calculando ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RouteIcon className="h-4 w-4 mr-1" />
                )}
                Otimizar rota
              </Button>
            </div>
          </div>
          <div className="relative flex-1">
            {loadingMap && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            <div ref={mapRef} className="w-full h-full" />
          </div>
        </Card>
      </div>
    </div>
  );
}
