import type { EstimateSettings, PriceList } from './estimate';

/**
 * Starting prices (installed, USD) so a first estimate isn't all zeros.
 * They are rough examples: each landscaper edits them to match their own
 * rates, and edits are remembered on the device.
 */
export const DEFAULT_PRICES: PriceList = {
  'asset:shade-tree': 350,
  'asset:spruce': 300,
  'asset:arborvitae': 120,
  'asset:japanese-maple': 450,
  'asset:flowering-cherry': 300,
  'asset:palm': 600,
  'asset:boxwood': 45,
  'asset:hedge': 150,
  'asset:hydrangea': 55,
  'asset:flowering-shrub': 45,
  'asset:ornamental-grass': 30,
  'asset:lavender': 20,
  'asset:hosta': 18,
  'asset:annual-flowers': 60,
  'asset:boulder': 250,
  'asset:planter': 120,
  'asset:path-light': 150,
  'asset:fire-pit': 1800,
  'asset:front-door': 1500,
  'asset:shutter': 120,
  'asset:window-box': 140,
  'asset:wall-lantern': 180,
  'material:lawn': 1.5,
  'material:mulch-brown': 1,
  'material:mulch-black': 1,
  'material:mulch-red': 1,
  'material:river-rock': 2.5,
  'material:pea-gravel': 1.75,
  'material:brick-pavers': 18,
  'material:patio-pavers': 15,
  'material:flagstone': 22,
  'material:concrete': 10,
  'material:deck': 35,
  'material:siding-white': 8,
  'material:siding-gray': 8,
  'material:siding-navy': 8,
  'material:siding-sage': 8,
  'material:brick-wall': 25,
  'material:stone-veneer': 30,
  removal: 150,
};

export const DEFAULT_ESTIMATE_SETTINGS: EstimateSettings = { taxRate: 0, cameraHeightFt: 5 };

const PRICES_KEY = 'vep.prices';
const SETTINGS_KEY = 'vep.estimateSettings';

function read<T>(key: string): Partial<T> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : {};
  } catch {
    return {};
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Could not save pricing on this device:', error);
  }
}

export function loadPrices(): PriceList {
  return { ...DEFAULT_PRICES, ...(read<PriceList>(PRICES_KEY) as PriceList) };
}

export function savePrices(prices: PriceList): void {
  write(PRICES_KEY, prices);
}

export function loadEstimateSettings(): EstimateSettings {
  return { ...DEFAULT_ESTIMATE_SETTINGS, ...read<EstimateSettings>(SETTINGS_KEY) };
}

export function saveEstimateSettings(settings: EstimateSettings): void {
  write(SETTINGS_KEY, settings);
}
