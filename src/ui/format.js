export function money(n) {
  const v = Math.round(n || 0);
  const abs = Math.abs(v);
  const s = abs >= 1000000
    ? (abs / 1000000).toFixed(abs >= 10000000 ? 1 : 2).replace(/\.0+$/, "") + "M"
    : abs >= 10000
      ? Math.round(abs / 1000) + "k"
      : abs.toLocaleString("en-US");
  return (v < 0 ? "\u2212$" : "$") + s;
}

export function moneyExact(n) {
  const v = Math.round(n || 0);
  return (v < 0 ? "\u2212$" : "$") + Math.abs(v).toLocaleString("en-US");
}

export function count(n) {
  return Math.round(n || 0).toLocaleString("en-US");
}

export function signed(n, suffix = "") {
  const v = Math.round(n);
  if (v === 0) return "0" + suffix;
  return (v > 0 ? "+" : "\u2212") + Math.abs(v) + suffix;
}


export function mul(n) {
  if (n == null || n === 1) return "";
  return "\u00d7" + (Math.round(n * 100) / 100);
}

export function pct(n) {
  return Math.round(n * 100) + "%";
}

export function phaseLabel(phase) {
  return { pitch: "Pitch", production: "Production", launch: "Launch" }[phase] || phase;
}

export function actLabel(act) {
  return { 1: "The Purple Years", 2: "The Garage", 3: "The Empire" }[act] || "";
}

export function actRoman(act) {
  return { 1: "I", 2: "II", 3: "III" }[act] || String(act);
}

export function yearQuarter(quarter) {
  const year = Math.floor((quarter - 1) / 4) + 1;
  const q = ((quarter - 1) % 4) + 1;
  return `Y${year} Q${q}`;
}

export function axisLabel(k) {
  return { pc: "PC", fun: "FUN", gore: "GORE", ordinary: "ORD" }[k] || k.toUpperCase();
}

