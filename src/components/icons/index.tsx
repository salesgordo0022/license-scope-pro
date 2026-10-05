import { forwardRef, type SVGProps } from 'react';
import { cn } from '@/lib/utils';
import { SOLAR } from './solar-dados';

/**
 * Ícones do sistema (pacote Solar, estilo bold-duotone).
 *
 * Cada ícone é exportado com o mesmo nome que o código usava do lucide-react
 * (`Users`, `Plus`, `ChevronDown`...), então trocar de pacote foi só mudar o
 * `from`. Os desenhos ficam embutidos em `solar-dados.ts` — nada é baixado em
 * tempo de execução. Para incluir um ícone novo, adicione-o ao MAPA de
 * `scripts/gerar-icones.mjs` e rode o script.
 *
 * Tamanho e cor seguem o padrão do lucide: 24px por padrão, sobrescrito por
 * classes (`h-4 w-4`), e cor herdada do texto (`currentColor`).
 */
export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
  /** Aceito só por compatibilidade com o lucide; o Solar não usa traço variável. */
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
}

export type Icone = ReturnType<typeof criarIcone>;

function criarIcone(nome: keyof typeof SOLAR) {
  const { corpo, largura, altura } = SOLAR[nome];
  const Componente = forwardRef<SVGSVGElement, IconProps>(
    ({ size = 24, strokeWidth, absoluteStrokeWidth, className, ...resto }, ref) => (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${largura} ${altura}`}
        width={size}
        height={size}
        aria-hidden="true"
        className={cn('shrink-0', className)}
        {...resto}
        dangerouslySetInnerHTML={{ __html: corpo }}
      />
    )
  );
  Componente.displayName = nome;
  return Componente;
}

/** Indicador de carregamento (gira com `animate-spin`, como o Loader2 do lucide). */
export const Loader2 = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, strokeWidth, absoluteStrokeWidth, className, ...resto }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
      {...resto}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
);
Loader2.displayName = 'Loader2';

export const AlertCircle = criarIcone('AlertCircle');
export const AlertTriangle = criarIcone('AlertTriangle');
export const ArrowDownRight = criarIcone('ArrowDownRight');
export const ArrowRight = criarIcone('ArrowRight');
export const ArrowUpRight = criarIcone('ArrowUpRight');
export const BarChart3 = criarIcone('BarChart3');
export const Bell = criarIcone('Bell');
export const BookCopy = criarIcone('BookCopy');
export const Box = criarIcone('Box');
export const Boxes = criarIcone('Boxes');
export const Building2 = criarIcone('Building2');
export const Calculator = criarIcone('Calculator');
export const Calendar = criarIcone('Calendar');
export const CalendarDays = criarIcone('CalendarDays');
export const ChartNoAxesCombined = criarIcone('ChartNoAxesCombined');
export const Check = criarIcone('Check');
export const CheckCircle = criarIcone('CheckCircle');
export const CheckCircle2 = criarIcone('CheckCircle2');
export const ChevronDown = criarIcone('ChevronDown');
export const ChevronLeft = criarIcone('ChevronLeft');
export const ChevronRight = criarIcone('ChevronRight');
export const ChevronUp = criarIcone('ChevronUp');
export const Circle = criarIcone('Circle');
export const CircleCheck = criarIcone('CircleCheck');
export const CircleDollarSign = criarIcone('CircleDollarSign');
export const ClipboardList = criarIcone('ClipboardList');
export const Clock = criarIcone('Clock');
export const Clock3 = criarIcone('Clock3');
export const Columns3 = criarIcone('Columns3');
export const Copy = criarIcone('Copy');
export const CreditCard = criarIcone('CreditCard');
export const DollarSign = criarIcone('DollarSign');
export const Download = criarIcone('Download');
export const Edit = criarIcone('Edit');
export const ExternalLink = criarIcone('ExternalLink');
export const Eye = criarIcone('Eye');
export const EyeOff = criarIcone('EyeOff');
export const FileSearch = criarIcone('FileSearch');
export const FileText = criarIcone('FileText');
export const Filter = criarIcone('Filter');
export const FolderOpen = criarIcone('FolderOpen');
export const GitBranch = criarIcone('GitBranch');
export const GripVertical = criarIcone('GripVertical');
export const Headphones = criarIcone('Headphones');
export const HelpCircle = criarIcone('HelpCircle');
export const History = criarIcone('History');
export const Info = criarIcone('Info');
export const Key = criarIcone('Key');
export const KeyRound = criarIcone('KeyRound');
export const Layers = criarIcone('Layers');
export const LayoutGrid = criarIcone('LayoutGrid');
export const Link = criarIcone('Link');
export const Link2 = criarIcone('Link2');
export const List = criarIcone('List');
export const Locate = criarIcone('Locate');
export const Lock = criarIcone('Lock');
export const LogIn = criarIcone('LogIn');
export const LogOut = criarIcone('LogOut');
export const Mail = criarIcone('Mail');
export const Map = criarIcone('Map');
export const MapPin = criarIcone('MapPin');
export const MessageCircle = criarIcone('MessageCircle');
export const MessageSquare = criarIcone('MessageSquare');
export const Monitor = criarIcone('Monitor');
export const MoreHorizontal = criarIcone('MoreHorizontal');
export const Navigation = criarIcone('Navigation');
export const Package = criarIcone('Package');
export const Paperclip = criarIcone('Paperclip');
export const Pencil = criarIcone('Pencil');
export const Phone = criarIcone('Phone');
export const Plus = criarIcone('Plus');
export const Printer = criarIcone('Printer');
export const Receipt = criarIcone('Receipt');
export const RefreshCw = criarIcone('RefreshCw');
export const Route = criarIcone('Route');
export const Save = criarIcone('Save');
export const Search = criarIcone('Search');
export const Send = criarIcone('Send');
export const Settings = criarIcone('Settings');
export const Settings2 = criarIcone('Settings2');
export const Shield = criarIcone('Shield');
export const ShieldAlert = criarIcone('ShieldAlert');
export const ShieldCheck = criarIcone('ShieldCheck');
export const ShieldHalf = criarIcone('ShieldHalf');
export const ShoppingCart = criarIcone('ShoppingCart');
export const StickyNote = criarIcone('StickyNote');
export const Store = criarIcone('Store');
export const Inbox = criarIcone('Inbox');
export const InboxUnread = criarIcone('InboxUnread');
export const ChatUnread = criarIcone('ChatUnread');
export const Sun = criarIcone('Sun');
export const Moon = criarIcone('Moon');
export const Tag = criarIcone('Tag');
export const Tags = criarIcone('Tags');
export const Target = criarIcone('Target');
export const Trash2 = criarIcone('Trash2');
export const TrendingUp = criarIcone('TrendingUp');
export const Trophy = criarIcone('Trophy');
export const Upload = criarIcone('Upload');
export const User = criarIcone('User');
export const UserCog = criarIcone('UserCog');
export const UserRound = criarIcone('UserRound');
export const Users = criarIcone('Users');
export const Wallet = criarIcone('Wallet');
export const X = criarIcone('X');
export const XCircle = criarIcone('XCircle');
export const Zap = criarIcone('Zap');
