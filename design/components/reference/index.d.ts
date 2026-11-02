import type * as React from 'react';
export interface LogoProps { tone?: 'light' | 'dark'; size?: number; markOnly?: boolean }
export declare function Logo(props: LogoProps): React.ReactElement;
export interface ZelligePatternProps { width?: number; height?: number; opacity?: number; scale?: number; fade?: boolean; fadeX?: string; fadeY?: string; style?: React.CSSProperties }
export declare function ZelligePattern(props: ZelligePatternProps): React.ReactElement;
export interface IconProps { name: string; size?: number; color?: string; fill?: string; strokeWidth?: number; label?: string }
export declare function Icon(props: IconProps): React.ReactElement;
export interface IconButtonProps { name: string; size?: number; bg?: string; color?: string; fill?: string }
export declare function IconButton(props: IconButtonProps): React.ReactElement;
export interface ButtonProps { variant?: 'primary' | 'dark' | 'secondary' | 'ghost' | 'danger' | 'saffron' | 'success'; size?: 'L' | 'M' | 'S'; icon?: string; iconRight?: string; block?: boolean; disabled?: boolean; onClick?: () => void; children?: React.ReactNode }
export declare function Button(props: ButtonProps): React.ReactElement;
export interface ChipProps { selected?: boolean; icon?: string; removable?: boolean; onClick?: () => void; children?: React.ReactNode }
export declare function Chip(props: ChipProps): React.ReactElement;
export interface EquipmentPillProps { selected?: boolean; onClick?: () => void; children?: React.ReactNode }
export declare function EquipmentPill(props: EquipmentPillProps): React.ReactElement;
export interface EquipmentGroupProps { title: string; icon?: string; mode?: 'select' | 'view'; items: (string | { name: string; selected?: boolean })[]; total?: number; open?: boolean; collapsible?: boolean; max?: number; flush?: boolean; style?: React.CSSProperties; lang?: 'en' | 'fr' | 'ar' }
export declare function EquipmentGroup(props: EquipmentGroupProps): React.ReactElement;
export interface SegmentedProps { items: string[]; active?: string }
export declare function Segmented(props: SegmentedProps): React.ReactElement;
export interface InputProps { label?: string; value?: string; placeholder?: string; state?: 'default' | 'filled' | 'focus' | 'error' | 'disabled'; icon?: string; suffix?: string; select?: boolean; helper?: string; multiline?: boolean; rows?: number; mono?: boolean }
export declare function Input(props: InputProps): React.ReactElement;
export interface ToggleProps { on?: boolean }
export declare function Toggle(props: ToggleProps): React.ReactElement;
export interface CheckboxProps { checked?: boolean }
export declare function Checkbox(props: CheckboxProps): React.ReactElement;
export interface RadioProps { checked?: boolean }
export declare function Radio(props: RadioProps): React.ReactElement;
export interface UploadTileProps { state?: 'empty' | 'filled' | 'cover' | 'new' | 'uploading' | 'failed'; tone?: string; width?: number; height?: number; fluid?: boolean; ratio?: string; progress?: number; label?: string; hint?: string; video?: boolean; duration?: string; actions?: boolean; locked?: boolean; disabled?: boolean; lang?: 'en' | 'fr' | 'ar' }
export declare function UploadTile(props: UploadTileProps): React.ReactElement;
export interface MediaLimitsProps { images?: number; videos?: number; pending?: number; max?: number; min?: number; coverIsPhoto?: boolean; compact?: boolean; lang?: 'en' | 'fr' | 'ar' }
export declare function MediaLimits(props: MediaLimitsProps): React.ReactElement;
export interface StepperProps { step: number; steps?: string[]; lang?: 'en' | 'fr' | 'ar' }
export declare function Stepper(props: StepperProps): React.ReactElement;
export interface BadgeProps { tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'saffron' | 'dark'; dot?: boolean; children?: React.ReactNode }
export declare function Badge(props: BadgeProps): React.ReactElement;
export interface AvatarProps { initials: string; size?: 'XS' | 'S' | 'M' | 'L' | 'XL'; tone?: 'brand' | 'saffron' | 'ink' | 'night' }
export declare function Avatar(props: AvatarProps): React.ReactElement;
export interface RatingProps { score?: string; count?: string; size?: 'S' | 'M' }
export declare function Rating(props: RatingProps): React.ReactElement;
export interface SpecItemProps { label: string; value: string; icon?: string; width?: number }
export declare function SpecItem(props: SpecItemProps): React.ReactElement;
export interface StatCardProps { label: string; value: string; trend?: string; icon?: string; tone?: string }
export declare function StatCard(props: StatCardProps): React.ReactElement;
export interface TabsProps { items: { label: string; count?: number }[]; active?: string }
export declare function Tabs(props: TabsProps): React.ReactElement;
export interface PaginationProps { page?: number; pages?: number }
export declare function Pagination(props: PaginationProps): React.ReactElement;
export interface CarPhotoProps { tone?: 'sand' | 'majorelle' | 'clay' | 'olive' | 'night' | 'sky' | 'saffron'; width?: number; height?: number; radius?: number; fluid?: boolean; ratio?: string; alt?: string; children?: React.ReactNode }
export declare function CarPhoto(props: CarPhotoProps): React.ReactElement;
export interface ListingCardProps { title: string; meta: string; price: string; city: string; tone?: string; inspectedScore?: number; favorite?: boolean; photos?: number; width?: number; fluid?: boolean; lang?: 'en' | 'fr' | 'ar' }
export declare function ListingCard(props: ListingCardProps): React.ReactElement;
export interface MechanicCardProps { name: string; address: string; rating?: string; reviews?: number; price: string; initials?: string; description?: string; verified?: boolean; cta?: string; width?: number; lang?: 'en' | 'fr' | 'ar' }
export declare function MechanicCard(props: MechanicCardProps): React.ReactElement;
export interface ReviewItemProps { name: string; initials: string; context?: string; message: string; score?: string; mine?: boolean; lang?: 'en' | 'fr' | 'ar' }
export declare function ReviewItem(props: ReviewItemProps): React.ReactElement;
export interface MapViewProps { pins?: { x: number; y: number; label?: string; active?: boolean; icon?: string }[]; width?: number | string; height?: number; radius?: number; zoom?: boolean }
export declare function MapView(props: MapViewProps): React.ReactElement;
export interface ScoreRingProps { score: number; verdict?: 'excellent' | 'good' | 'fair' | 'poor'; size?: number }
export declare function ScoreRing(props: ScoreRingProps): React.ReactElement;
export interface ChecklistRowProps { status: 'pass' | 'attention' | 'fail'; item: string; note?: string; lang?: 'en' | 'fr' | 'ar' }
export declare function ChecklistRow(props: ChecklistRowProps): React.ReactElement;
export interface InspectionTimelineProps { stage: 0 | 1 | 2 | 3; rejected?: boolean; lang?: 'en' | 'fr' | 'ar' }
export declare function InspectionTimeline(props: InspectionTimelineProps): React.ReactElement;
export interface RoleSwitchProps { active?: 'Buyer' | 'Seller' | 'Mechanic'; lang?: 'en' | 'fr' | 'ar' }
export declare function RoleSwitch(props: RoleSwitchProps): React.ReactElement;
export interface NavDesktopProps { active?: string; role?: 'Buyer' | 'Seller' | 'Mechanic'; signedIn?: boolean; initials?: string; links?: string[]; lang?: 'en' | 'fr' | 'ar'; langOpen?: boolean }
export declare function NavDesktop(props: NavDesktopProps): React.ReactElement;
export interface MobileHeaderProps { variant?: 'main' | 'back'; title?: string; action?: string; initials?: string; lang?: 'en' | 'fr' | 'ar' }
export declare function MobileHeader(props: MobileHeaderProps): React.ReactElement;
export interface StatusBarProps { dark?: boolean }
export declare function StatusBar(props: StatusBarProps): React.ReactElement;
export interface TabBarProps { active?: string; role?: 'user' | 'mechanic'; lang?: 'en' | 'fr' | 'ar' }
export declare function TabBar(props: TabBarProps): React.ReactElement;
export interface LanguageSwitchProps { active?: 'en' | 'fr' | 'ar'; variant?: 'pill' | 'segmented' | 'list'; open?: boolean; dark?: boolean; lang?: 'en' | 'fr' | 'ar' }
export declare function LanguageSwitch(props: LanguageSwitchProps): React.ReactElement;
export interface FooterProps { lang?: 'en' | 'fr' | 'ar' }
export declare function Footer(props: FooterProps): React.ReactElement;
declare global { interface Window { AutoSouk: { Logo: typeof Logo; ZelligePattern: typeof ZelligePattern; Icon: typeof Icon; IconButton: typeof IconButton; Button: typeof Button; Chip: typeof Chip; EquipmentPill: typeof EquipmentPill; EquipmentGroup: typeof EquipmentGroup; Segmented: typeof Segmented; Input: typeof Input; Toggle: typeof Toggle; Checkbox: typeof Checkbox; Radio: typeof Radio; UploadTile: typeof UploadTile; MediaLimits: typeof MediaLimits; Stepper: typeof Stepper; Badge: typeof Badge; Avatar: typeof Avatar; Rating: typeof Rating; SpecItem: typeof SpecItem; StatCard: typeof StatCard; Tabs: typeof Tabs; Pagination: typeof Pagination; CarPhoto: typeof CarPhoto; ListingCard: typeof ListingCard; MechanicCard: typeof MechanicCard; ReviewItem: typeof ReviewItem; MapView: typeof MapView; ScoreRing: typeof ScoreRing; ChecklistRow: typeof ChecklistRow; InspectionTimeline: typeof InspectionTimeline; RoleSwitch: typeof RoleSwitch; NavDesktop: typeof NavDesktop; MobileHeader: typeof MobileHeader; StatusBar: typeof StatusBar; TabBar: typeof TabBar; LanguageSwitch: typeof LanguageSwitch; Footer: typeof Footer; ICON_NAMES: string[] } } }
