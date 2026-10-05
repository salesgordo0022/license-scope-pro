// Gera src/components/icons/solar-dados.ts com só os ícones Solar que o sistema usa.
// Rodar depois de mudar o MAPA: `node scripts/gerar-icones.mjs`.
// O catálogo completo (@iconify-json/solar) é devDependency e não vai para o bundle.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const solar = JSON.parse(readFileSync(require.resolve('@iconify-json/solar/icons.json'), 'utf8'));

// Nome do componente (compatível com o que o código já importava) → ícone Solar.
// Ícones de controle (setas, X, +, check) usam a versão linear, que fica nítida
// em tamanho pequeno; o resto usa bold-duotone.
export const MAPA = {
  AlertCircle: 'danger-circle-bold-duotone',
  AlertTriangle: 'danger-triangle-bold-duotone',
  ArrowDownRight: 'arrow-right-down-linear',
  ArrowRight: 'arrow-right-linear',
  ArrowUpRight: 'arrow-right-up-linear',
  BarChart3: 'chart-2-bold-duotone',
  Bell: 'bell-bold-duotone',
  BookCopy: 'notebook-bold-duotone',
  Box: 'box-bold-duotone',
  Boxes: 'box-minimalistic-bold-duotone',
  Building2: 'buildings-2-bold-duotone',
  Calculator: 'calculator-bold-duotone',
  Calendar: 'calendar-bold-duotone',
  CalendarDays: 'calendar-date-bold-duotone',
  ChartNoAxesCombined: 'graph-new-up-bold-duotone',
  Check: 'check-linear',
  CheckCircle: 'check-circle-bold-duotone',
  CheckCircle2: 'check-circle-bold-duotone',
  ChevronDown: 'alt-arrow-down-linear',
  ChevronLeft: 'alt-arrow-left-linear',
  ChevronRight: 'alt-arrow-right-linear',
  ChevronUp: 'alt-arrow-up-linear',
  Circle: 'record-linear',
  CircleCheck: 'check-circle-bold-duotone',
  CircleDollarSign: 'dollar-minimalistic-bold-duotone',
  ClipboardList: 'clipboard-list-bold-duotone',
  Clock: 'clock-circle-bold-duotone',
  Clock3: 'clock-circle-bold-duotone',
  Columns3: 'columns-3-bold-duotone',
  Copy: 'copy-bold-duotone',
  CreditCard: 'card-bold-duotone',
  DollarSign: 'wallet-money-bold-duotone',
  Download: 'download-minimalistic-bold-duotone',
  Edit: 'pen-bold-duotone',
  ExternalLink: 'square-share-line-bold-duotone',
  Eye: 'eye-bold-duotone',
  EyeOff: 'eye-closed-bold-duotone',
  FileSearch: 'document-text-bold-duotone',
  FileText: 'document-text-bold-duotone',
  Filter: 'filter-bold-duotone',
  FolderOpen: 'folder-open-bold-duotone',
  GitBranch: 'git-branch-bold-duotone',
  GripVertical: 'menu-dots-vertical-bold',
  Headphones: 'headphones-round-bold-duotone',
  HelpCircle: 'question-circle-bold-duotone',
  History: 'history-bold-duotone',
  Info: 'info-circle-bold-duotone',
  Key: 'key-bold-duotone',
  KeyRound: 'key-minimalistic-square-bold-duotone',
  Layers: 'layers-bold-duotone',
  LayoutGrid: 'widget-5-bold-duotone',
  Link: 'link-bold-duotone',
  Link2: 'link-minimalistic-2-bold-duotone',
  List: 'list-bold-duotone',
  Locate: 'gps-bold-duotone',
  Lock: 'lock-keyhole-bold-duotone',
  LogIn: 'login-2-bold-duotone',
  LogOut: 'logout-2-bold-duotone',
  Mail: 'letter-bold-duotone',
  Map: 'map-bold-duotone',
  MapPin: 'map-point-bold-duotone',
  MessageCircle: 'chat-round-dots-bold-duotone',
  MessageSquare: 'chat-square-dots-bold-duotone',
  Monitor: 'monitor-bold-duotone',
  MoreHorizontal: 'menu-dots-bold',
  Navigation: 'map-arrow-up-bold-duotone',
  Package: 'box-bold-duotone',
  Paperclip: 'paperclip-bold-duotone',
  Pencil: 'pen-2-bold-duotone',
  Phone: 'phone-bold-duotone',
  Plus: 'add-linear',
  Printer: 'printer-bold-duotone',
  Receipt: 'bill-list-bold-duotone',
  RefreshCw: 'refresh-bold-duotone',
  Route: 'routing-2-bold-duotone',
  Save: 'diskette-bold-duotone',
  Search: 'magnifer-linear',
  Send: 'plain-bold-duotone',
  Settings: 'settings-bold-duotone',
  Settings2: 'tuning-2-bold-duotone',
  Shield: 'shield-bold-duotone',
  ShieldAlert: 'shield-warning-bold-duotone',
  ShieldCheck: 'shield-check-bold-duotone',
  ShieldHalf: 'shield-keyhole-bold-duotone',
  ShoppingCart: 'cart-large-2-bold-duotone',
  StickyNote: 'notes-bold-duotone',
  Store: 'shop-bold-duotone',
  Forum: 'notebook-bookmark-bold-duotone',
  Negrito: 'text-bold-linear',
  Italico: 'text-italic-linear',
  Riscado: 'text-cross-linear',
  Titulo: 'text-square-linear',
  ListaPontos: 'list-linear',
  ListaNumeros: 'list-down-minimalistic-linear',
  ListaTarefas: 'checklist-minimalistic-linear',
  Citacao: 'chat-square-quote-linear',
  Codigo: 'code-square-linear',
  ImagemAdd: 'gallery-add-linear',
  Desfazer: 'undo-left-linear',
  Refazer: 'undo-right-linear',
  Marcador: 'pen-new-square-linear',
  LinkIcone: 'link-round-linear',
  Nota: 'sticker-square-linear',
  AjustarTela: 'maximize-square-minimalistic-linear',
  Documentos: 'documents-bold-duotone',
  Etiqueta: 'hashtag-linear',
  Fixar: 'pin-bold-duotone',
  Galeria: 'gallery-wide-bold-duotone',
  Inbox: 'inbox-bold-duotone',
  InboxUnread: 'inbox-unread-bold-duotone',
  ChatUnread: 'chat-round-unread-bold-duotone',
  Sun: 'sun-2-bold-duotone',
  Moon: 'moon-bold-duotone',
  Tag: 'tag-bold-duotone',
  Tags: 'tag-price-bold-duotone',
  Target: 'target-bold-duotone',
  Trash2: 'trash-bin-trash-bold-duotone',
  TrendingUp: 'graph-up-bold-duotone',
  Trophy: 'cup-star-bold-duotone',
  Upload: 'upload-minimalistic-bold-duotone',
  User: 'user-bold-duotone',
  UserCog: 'user-id-bold-duotone',
  UserRound: 'user-rounded-bold-duotone',
  Users: 'users-group-rounded-bold-duotone',
  Wallet: 'wallet-bold-duotone',
  X: 'close-linear',
  XCircle: 'close-circle-bold-duotone',
  Zap: 'bolt-bold-duotone',
};

const larguraPadrao = solar.width ?? 24;
const alturaPadrao = solar.height ?? 24;
const faltando = [];
const dados = {};

for (const [componente, nome] of Object.entries(MAPA)) {
  // Alias simples: resolve para o ícone pai.
  const icone = solar.icons[nome] ?? solar.icons[solar.aliases?.[nome]?.parent];
  if (!icone) {
    faltando.push(`${componente} → ${nome}`);
    continue;
  }
  dados[componente] = {
    corpo: icone.body,
    largura: icone.width ?? larguraPadrao,
    altura: icone.height ?? alturaPadrao,
  };
}

if (faltando.length) {
  console.error('Ícones não encontrados no Solar:\n  ' + faltando.join('\n  '));
  process.exit(1);
}

const saida =
  '// Arquivo gerado por scripts/gerar-icones.mjs — não editar à mão.\n' +
  '// Ícones Solar (Iconify, licença CC BY 4.0, por 480 Design).\n' +
  `export const SOLAR = ${JSON.stringify(dados, null, 2)} as const;\n`;

writeFileSync(new URL('../src/components/icons/solar-dados.ts', import.meta.url), saida);
console.log(`${Object.keys(dados).length} ícones gerados.`);
