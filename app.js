/* Cuentas del mes: logica y guardado en localStorage. */
(function () {
  var MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  var DEFAULTS = {
    gasto: ["Gasolina", "Cenas", "Uni", "Comida", "Ocio", "Alquiler", "Transporte", "Otros"],
    ingreso: ["Nómina", "Beca", "Familia", "Otros ingresos"]
  };
  var eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", useGrouping: "always" });
  var $ = function (id) { return document.getElementById(id); };

  var state = { items: [], month: monthKey(new Date()), type: "gasto", mode: "loading" };
  var store = null;

  function pad(n) { return String(n).padStart(2, "0"); }
  function monthKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }
  function money(n) { return eur.format(n); }
  function mshort(n) { return eur.format(n).replace(/\s?€/, ""); }
  function shortMonth(key) { var p = key.split("-"); return MESES[+p[1] - 1].slice(0, 3) + " \u2019" + p[0].slice(2); }
  function shiftMonth(key, delta) {
    var p = key.split("-"); var d = new Date(+p[0], +p[1] - 1 + delta, 1); return monthKey(d);
  }
  function monthName(key) { var p = key.split("-"); return MESES[+p[1] - 1] + " " + p[0]; }
  function fmtDate(s) { var p = s.split("-"); return p[2] + "/" + p[1]; }

  /* ---------- almacenamiento ---------- */
  var META_KEY = "cuentas-meta-v1";
  function metaGet() { try { return JSON.parse(localStorage.getItem(META_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function metaSet(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {} }
  function bump() { var m = metaGet(); m.rev = (m.rev || 0) + 1; metaSet(m); }

  function localStore() {
    var KEY = "cuentas-del-mes-v1";
    var listeners = [];
    function read() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } }
    function write(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
    var mem = read();
    function emit() { listeners.forEach(function (f) { f(mem.slice()); }); }
    function changed() { write(mem); bump(); emit(); }
    return {
      mode: "local",
      subscribe: function (f) { listeners.push(f); f(mem.slice()); },
      add: function (item) { mem = mem.filter(function (x) { return x.id !== item.id; }); mem.push(item); changed(); return Promise.resolve(); },
      addMany: function (list) {
        var ids = {}; list.forEach(function (x) { ids[x.id] = 1; });
        mem = mem.filter(function (x) { return !ids[x.id]; }).concat(list); changed(); return Promise.resolve();
      },
      replaceAll: function (list) { mem = list.slice(); changed(); return Promise.resolve(); },
      remove: function (id) { mem = mem.filter(function (x) { return x.id !== id; }); changed(); return Promise.resolve(); }
    };
  }

  function init() {
    store = localStore();
    state.mode = "local";
    store.subscribe(function (items) { state.items = items; render(); });
    render();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  }

  /* ---------- cálculos ---------- */
  function monthItems() { return state.items.filter(function (x) { return x.date.slice(0, 7) === state.month; }); }
  function sum(arr) { return arr.reduce(function (a, x) { return a + (Number(x.amount) || 0); }, 0); }
  function groupByCat(arr) {
    var map = {};
    arr.forEach(function (x) {
      var k = String(x.cat || "Sin categoría").trim().toLowerCase();
      if (!map[k]) map[k] = { name: String(x.cat || "Sin categoría").trim(), total: 0, n: 0 };
      map[k].total += Number(x.amount) || 0; map[k].n += 1;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.total - a.total; });
  }

  /* ---------- render ---------- */
  function catTable(rows, kind, total) {
    if (!rows.length) return '<div class="empty">Aún no hay ' + (kind === "neg" ? "gastos" : "ingresos") + " este mes.</div>";
    var body = rows.map(function (r) {
      var pct = total > 0 ? (r.total / total) * 100 : 0;
      return "<tr><td>" + esc(r.name) + '</td><td class="r num muted">' + r.n + '</td><td class="r num">' + money(r.total) +
        '</td><td style="width:26%"><div class="bar ' + kind + '" title="' + pct.toFixed(0) + '%"><span style="width:' + pct.toFixed(1) + '%"></span></div></td>' +
        '<td class="r num muted">' + pct.toFixed(0) + "%</td></tr>";
    }).join("");
    return "<table><thead><tr><th>Categoría</th><th class='r'>Mov.</th><th class='r'>Total</th><th></th><th class='r'>%</th></tr></thead><tbody>" + body +
      "</tbody><tfoot><tr><td>Total</td><td></td><td class='r num'>" + money(total) + "</td><td></td><td></td></tr></tfoot></table>";
  }

  function render() {
    $("monthLabel").textContent = monthName(state.month);
    var items = monthItems();
    var gastos = items.filter(function (x) { return x.type === "gasto"; });
    var ingresos = items.filter(function (x) { return x.type === "ingreso"; });
    var tg = sum(gastos), ti = sum(ingresos), bal = ti - tg;

    $("tPos").textContent = money(ti);
    $("tNeg").textContent = money(tg);
    $("tSum").textContent = (bal > 0 ? "+" : "") + money(bal);
    var box = $("tSumBox");
    box.classList.toggle("pos", bal >= 0); box.classList.toggle("neg", bal < 0);
    $("tSumHint").textContent = bal > 0 ? "Este mes te sobra dinero" : bal < 0 ? "Este mes gastas más de lo que ingresas" : "Ingresos menos gastos";

    $("gTable").innerHTML = catTable(groupByCat(gastos), "neg", tg);
    $("iTable").innerHTML = catTable(groupByCat(ingresos), "pos", ti);

    var movs = items.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ts || 0) - (a.ts || 0); });
    $("movTable").innerHTML = movs.length
      ? "<table><thead><tr><th>Fecha</th><th>Categoría</th><th>Nota</th><th class='r'>Importe</th><th></th></tr></thead><tbody>" +
        movs.map(function (x) {
          var neg = x.type === "gasto";
          return "<tr><td class='num muted'>" + fmtDate(x.date) + "</td><td>" + esc(x.cat) + "</td><td class='muted'>" + esc(x.note || "") +
            "</td><td class='r num " + (neg ? "amt-neg" : "amt-pos") + "'>" + (neg ? "−" : "+") + money(Number(x.amount)).replace("-", "") +
            "</td><td class='r' style='white-space:nowrap'><button class='edit' data-id='" + esc(x.id) + "' aria-label='Editar movimiento'>Editar</button><button class='del' data-id='" + esc(x.id) + "' aria-label='Borrar movimiento'>Borrar</button></td></tr>";
        }).join("") + "</tbody></table>"
      : '<div class="empty">Todavía no has añadido nada en ' + esc(monthName(state.month)) + ". Usa el formulario para registrar tu primer gasto o ingreso.</div>";

    // historial: todos los meses desde el primero con datos hasta el último
    var rows = [], ti_ = 0, tg_ = 0;
    var keys = state.items.map(function (x) { return x.date.slice(0, 7); }).sort();
    var months = [];
    if (keys.length) { for (var k0 = keys[0]; k0 <= keys[keys.length - 1]; k0 = shiftMonth(k0, 1)) months.push(k0); }
    for (var i = 0; i < months.length; i++) {
      var k = months[i];
      var its = state.items.filter(function (x) { return x.date.slice(0, 7) === k; });
      var pi = sum(its.filter(function (x) { return x.type === "ingreso"; }));
      var pg = sum(its.filter(function (x) { return x.type === "gasto"; }));
      ti_ += pi; tg_ += pg;
      rows.push("<tr class='mrow" + (k === state.month ? " cur" : "") + "' data-month='" + k + "'><td style='text-transform:capitalize;white-space:nowrap'>" + shortMonth(k) + "</td><td class='r num amt-pos'>" + mshort(pi) +
        "</td><td class='r num amt-neg'>" + mshort(pg) + "</td><td class='r num " + (pi - pg < 0 ? "amt-neg" : "amt-pos") + "'>" + mshort(pi - pg) + "</td></tr>");
    }
    $("histTable").innerHTML = rows.length
      ? "<table><thead><tr><th>Mes</th><th class='r'>Positivo €</th><th class='r'>Negativo €</th><th class='r'>Total €</th></tr></thead><tbody>" + rows.join("") +
        "</tbody><tfoot><tr><td>Total</td><td class='r num amt-pos'>" + mshort(ti_) + "</td><td class='r num amt-neg'>" + mshort(tg_) + "</td><td class='r num " + (ti_ - tg_ < 0 ? "amt-neg" : "amt-pos") + "'>" + mshort(ti_ - tg_) + "</td></tr></tfoot></table>"
      : '<div class="empty">Cuando añadas movimientos, aquí aparecerán todos los meses.</div>';

    renderCats();
    renderStatus();
    renderImport();
    renderBackup();
  }

  var importing = false, importDone = false;
  function renderImport() {
    var has = state.items.some(function (x) { return x.imported; });
    var ready = !!store;
    $("importBox").hidden = importing ? false : !(ready && !has && !importDone);
  }
  async function runImport() {
    if (importing || !store) return;
    importing = true;
    var btn = $("importBtn"), txt = $("importText");
    btn.disabled = true; btn.textContent = "Importando…";
    try {
      var res = await fetch("historial.json");
      var list = await res.json();
      await store.addMany(list);
      importing = false; importDone = true; state.month = "2026-11";
      $("importBox").hidden = true;
    } catch (e) {
      importing = false;
      txt.textContent = "No se pudo cargar el historial. Comprueba la conexión e inténtalo de nuevo.";
      btn.disabled = false; btn.textContent = "Reintentar";
    }
    render();
  }
  $("importBtn").addEventListener("click", runImport);

  function renderCats() {
    var set = {}, list = [];
    DEFAULTS[state.type].forEach(function (c) { set[c.toLowerCase()] = 1; list.push(c); });
    state.items.filter(function (x) { return x.type === state.type; }).forEach(function (x) {
      var k = String(x.cat).trim().toLowerCase();
      if (k && !set[k]) { set[k] = 1; list.push(String(x.cat).trim()); }
    });
    $("catList").innerHTML = list.map(function (c) { return '<option value="' + esc(c) + '"></option>'; }).join("");
    $("chips").innerHTML = list.slice(0, 8).map(function (c) { return '<button type="button" class="chip" data-cat="' + esc(c) + '">' + esc(c) + "</button>"; }).join("");
  }

  function pendingChanges() { var m = metaGet(); return (m.rev || 0) - (m.backupRev || 0); }
  function renderStatus() {
    var t = "Tus datos se guardan solo en este dispositivo.";
    if (state.items.length && pendingChanges() > 0) t += " Tienes cambios sin copia de seguridad.";
    $("status").textContent = t;
  }

  /* ---------- eventos ---------- */
  function setType(t) {
    state.type = t;
    $("typeGasto").setAttribute("aria-pressed", t === "gasto");
    $("typeIngreso").setAttribute("aria-pressed", t === "ingreso");
    $("cat").placeholder = t === "gasto" ? "Gasolina, Cenas, Uni…" : "Nómina, Beca…";
    renderCats();
  }
  $("typeGasto").addEventListener("click", function () { setType("gasto"); });
  $("typeIngreso").addEventListener("click", function () { setType("ingreso"); });
  $("prev").addEventListener("click", function () { state.month = shiftMonth(state.month, -1); render(); });
  $("next").addEventListener("click", function () { state.month = shiftMonth(state.month, 1); render(); });
  $("histTable").addEventListener("click", function (e) {
    var r = e.target.closest("tr[data-month]"); if (!r) return;
    state.month = r.getAttribute("data-month"); render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function startEdit(id) {
    var it = state.items.filter(function (x) { return x.id === id; })[0]; if (!it) return;
    state.editing = it;
    setType(it.type);
    $("amount").value = String(it.amount).replace(".", ",");
    $("date").value = it.date; $("cat").value = it.cat; $("note").value = it.note || "";
    $("addTitle").textContent = "Editar movimiento";
    $("saveBtn").textContent = "Guardar cambios";
    $("cancelEdit").hidden = false;
    $("msg").textContent = "";
    $("form").scrollIntoView({ behavior: "smooth", block: "center" });
    $("amount").focus();
  }
  function stopEdit() {
    state.editing = null;
    $("addTitle").textContent = "Añadir movimiento";
    $("saveBtn").textContent = "Guardar";
    $("cancelEdit").hidden = true;
    $("amount").value = ""; $("note").value = ""; $("cat").value = ""; $("date").value = todayStr();
    $("msg").textContent = "";
  }
  $("cancelEdit").addEventListener("click", stopEdit);
  $("chips").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cat]"); if (!b) return;
    $("cat").value = b.getAttribute("data-cat"); $("amount").focus();
  });
  $("movTable").addEventListener("click", function (e) {
    var eb = e.target.closest("button.edit");
    if (eb) { startEdit(eb.getAttribute("data-id")); return; }
    var b = e.target.closest("button.del"); if (!b || !store) return;
    if (state.editing && state.editing.id === b.getAttribute("data-id")) stopEdit();
    store.remove(b.getAttribute("data-id")).catch(function () { $("msg").textContent = "No se pudo borrar. Inténtalo de nuevo."; });
  });
  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("msg"); msg.textContent = "";
    var amount = parseFloat($("amount").value.replace(/\s/g, "").replace(",", "."));
    var cat = $("cat").value.trim();
    var date = $("date").value;
    if (!(amount > 0)) { msg.textContent = "Escribe un importe mayor que 0."; return; }
    if (!cat) { msg.textContent = "Elige o escribe una categoría."; return; }
    if (!date) { msg.textContent = "Elige una fecha."; return; }
    if (!store) { msg.textContent = "Espera un segundo, todavía está cargando."; return; }
    var key = cat.toLowerCase();
    var existing = state.items.map(function (x) { return String(x.cat).trim(); }).concat(DEFAULTS.gasto, DEFAULTS.ingreso)
      .filter(function (c) { return c.toLowerCase() === key; })[0];
    if (!existing) existing = cat.charAt(0).toUpperCase() + cat.slice(1);
    var item = {
      id: state.editing ? state.editing.id : "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: state.type, amount: Math.round(amount * 100) / 100, cat: existing,
      note: $("note").value.trim(), date: date, ts: state.editing ? (state.editing.ts || Date.now()) : Date.now()
    };
    if (state.editing && state.editing.imported) item.imported = true;
    store.add(item).then(function () {
      state.month = date.slice(0, 7);
      if (state.editing) stopEdit();
      $("amount").value = ""; $("note").value = ""; $("amount").focus();
      render();
    }).catch(function () { msg.textContent = "No se pudo guardar. Inténtalo de nuevo."; });
  });

  /* ---------- copia de seguridad ---------- */
  function fmtStamp(ts) {
    var d = new Date(ts);
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function renderBackup() {
    var m = metaGet(), pend = pendingChanges(), t, warn = false;
    if (!state.items.length) t = "Todavía no hay datos que guardar. Si vienes de otro móvil, usa Restaurar copia.";
    else if (!m.backupAt) { t = "Aún no has hecho ninguna copia. Si borras la app, perderás tus datos."; warn = true; }
    else if (pend > 0) { t = "Última copia: " + fmtStamp(m.backupAt) + ". Has hecho " + pend + (pend === 1 ? " cambio" : " cambios") + " desde entonces."; warn = true; }
    else t = "Última copia: " + fmtStamp(m.backupAt) + ". Todo está al día.";
    var el = $("backupInfo"); el.textContent = t; el.classList.toggle("warn", warn);
  }
  function markBackup(ts) {
    var m = metaGet(); m.backupRev = m.rev || 0; m.backupAt = ts || Date.now(); metaSet(m);
  }
  async function exportBackup() {
    var msg = $("backupMsg"); msg.textContent = ""; msg.className = "msg ok";
    var name = "cuentas-" + todayStr() + ".json";
    var json = JSON.stringify({ app: "cuentas-del-mes", version: 1, exportedAt: new Date().toISOString(), items: state.items }, null, 1);
    var done = false, file = null;
    try { file = new File([json], name, { type: "application/json" }); } catch (e) { file = null; }
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Copia de Cuentas del mes" });
        done = true;
      }
    } catch (e) { if (e && e.name === "AbortError") return; }
    if (!done) {
      var url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      var a = document.createElement("a"); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
    markBackup();
    msg.textContent = "Copia lista. Guárdala en Archivos o en iCloud Drive.";
    renderBackup(); renderStatus();
  }
  var pendingRestore = null;
  function cleanItem(x) {
    if (!x || !x.id || (x.type !== "gasto" && x.type !== "ingreso")) return null;
    if (typeof x.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return null;
    var amt = Number(x.amount); if (!(amt >= 0) || !x.cat) return null;
    var o = { id: String(x.id), type: x.type, amount: Math.round(amt * 100) / 100, cat: String(x.cat), note: x.note ? String(x.note) : "", date: x.date, ts: Number(x.ts) || Date.now() };
    if (x.imported) o.imported = true;
    return o;
  }
  $("exportBtn").addEventListener("click", exportBackup);
  $("restoreInput").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var msg = $("backupMsg"); msg.className = "msg"; msg.textContent = "";
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        var list = (Array.isArray(data) ? data : data.items).map(cleanItem).filter(Boolean);
        if (!list.length) throw new Error("vacio");
        pendingRestore = { list: list, at: data.exportedAt ? Date.parse(data.exportedAt) : null };
        var dates = list.map(function (x) { return x.date; }).sort();
        $("restoreText").textContent = "El archivo tiene " + list.length + " movimientos (de " + monthName(dates[0].slice(0, 7)) + " a " + monthName(dates[dates.length - 1].slice(0, 7)) + "). Combinar los añade a lo que ya tienes. Reemplazar todo borra lo actual y deja solo el archivo.";
        $("restoreChoice").hidden = false;
      } catch (err) {
        pendingRestore = null; $("restoreChoice").hidden = true;
        msg.textContent = "Ese archivo no es una copia válida de Cuentas del mes.";
      }
    };
    r.onerror = function () { msg.textContent = "No se pudo leer el archivo."; };
    r.readAsText(f);
    e.target.value = "";
  });
  async function doRestore(replace) {
    if (!pendingRestore || !store) return;
    var p = pendingRestore; pendingRestore = null; $("restoreChoice").hidden = true;
    if (replace) await store.replaceAll(p.list); else await store.addMany(p.list);
    importDone = true;
    if (replace) markBackup(p.at);
    var latest = p.list.map(function (x) { return x.date; }).sort().pop();
    state.month = latest.slice(0, 7);
    var msg = $("backupMsg"); msg.className = "msg ok"; msg.textContent = "Copia restaurada: " + p.list.length + " movimientos.";
    render();
  }
  $("restoreMerge").addEventListener("click", function () { doRestore(false); });
  $("restoreReplace").addEventListener("click", function () { doRestore(true); });
  $("restoreCancel").addEventListener("click", function () { pendingRestore = null; $("restoreChoice").hidden = true; });

  $("date").value = todayStr();
  setType("gasto");
  init();
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}

