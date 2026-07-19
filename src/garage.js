import { loadTruckModel, buildPlaceholderTruck } from './truck.js?v1784500641';

// Discovers trucks from /api/trucks (every .glb in assets/trucks/) and their
// optional overrides from trucks.json. Loaded models are cached so switching
// back and forth is instant.
export class Garage {
  constructor() {
    this.entries = [];
    this.index = 0;
    this.cache = new Map();
  }

  async init() {
    let files = [];
    try {
      files = await (await fetch('/api/trucks')).json(); // local dev server
    } catch {
      try {
        files = await (await fetch('assets/trucks/index.json')).json(); // static hosting
      } catch {
        console.warn('Could not list trucks (no /api/trucks and no index.json)');
      }
    }
    let configs = {};
    try {
      const res = await fetch('assets/trucks/trucks.json');
      if (res.ok) configs = await res.json();
    } catch {}

    this.entries = files.map((file) => {
      const id = file.replace(/\.glb$/, '');
      const config = configs[id] || {};
      return { id, url: 'assets/trucks/' + file, config, label: config.label || id };
    });
  }

  get count() {
    return this.entries.length;
  }

  // Load truck by index (wraps around). Returns { visual, wheels, label }.
  async load(i) {
    if (!this.entries.length) {
      const p = buildPlaceholderTruck();
      return { ...p, label: 'Placeholder' };
    }
    this.index = ((i % this.entries.length) + this.entries.length) % this.entries.length;
    const entry = this.entries[this.index];
    if (!this.cache.has(entry.id)) {
      this.cache.set(entry.id, loadTruckModel(entry.url, entry.config));
    }
    try {
      const model = await this.cache.get(entry.id);
      return { ...model, label: entry.label, engine: entry.config.engine };
    } catch (err) {
      console.error('Failed to load', entry.url, err);
      this.cache.delete(entry.id);
      const p = buildPlaceholderTruck();
      return { ...p, label: entry.label + ' (failed to load)' };
    }
  }
}
