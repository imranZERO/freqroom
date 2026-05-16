import { useState } from 'react';
import { ALL_PRESETS, PRESET_CATEGORIES } from '../lib/eqPresets.js';

export function EQSelector({ preset, onSelect }) {
  const [category, setCategory] = useState(PRESET_CATEGORIES[0]);
  const filtered = ALL_PRESETS.filter(p => p.category === category);

  return (
    <section className="card">
      <h2>EQ Test</h2>
      <div className="category-tabs">
        {PRESET_CATEGORIES.map(c => (
          <button
            key={c}
            className={`tab ${category === c ? 'active' : ''}`}
            onClick={() => {
              setCategory(c);
              const first = ALL_PRESETS.find(p => p.category === c);
              if (first) onSelect(first);
            }}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="preset-grid">
        {filtered.map(p => (
          <button
            key={p.id}
            className={`preset-btn ${preset?.id === p.id ? 'active' : ''}`}
            onClick={() => onSelect(p)}
            title={p.description}
          >
            {p.name}
          </button>
        ))}
      </div>
      {preset && (
        <p className="preset-desc">
          <strong>A</strong> = flat reference &nbsp;|&nbsp;
          <strong>B</strong> = {preset.description}
        </p>
      )}
    </section>
  );
}
