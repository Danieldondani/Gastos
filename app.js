/* Cuentas del mes: logica y guardado en localStorage. */
(function () {
  var MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  var DEFAULTS = {
    gasto: ["Gasolina", "Comida", "Uni", "Ocio", "Transporte", "Otros"],
    ingreso: ["Paga", "Beca", "Familia", "Otros ingresos"]
  };
  var CAT_KEY = "cuentas-cats-v1";
  var cats = null; /* { gasto: [...], ingreso: [...] } */
  var eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", useGrouping: "always" });
  var $ = function (id) { return document.getElementById(id); };

  var state = { items: [], month: monthKey(new Date()), type: "gasto", mode: "loading" };
  var store = null;

  function pad(n) { return String(n).padStart(2, "0"); }
  function monthKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
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
      var label = pct > 0 && pct < 1 ? "<1%" : Math.round(pct) + "%";
      return "<tr><td><div class='mname'>" + esc(r.name) + "</div><div class='msub muted'>" + r.n + (r.n === 1 ? " mov." : " movs.") + "</div></td>" +
        "<td class='r num' style='white-space:nowrap'>" + mshort(r.total) + "</td>" +
        "<td class='pcell'><div class='pct " + kind + "' role='img' aria-label='" + label + " del total'><span class='fill' style='width:" + Math.max(pct, 2).toFixed(1) + "%'></span><b>" + label + "</b></div></td></tr>";
    }).join("");
    return "<table class='cat'><thead><tr><th>Categoría</th><th class='r'>Total €</th><th>% del total</th></tr></thead><tbody>" + body +
      "</tbody><tfoot><tr><td>Total</td><td class='r num'>" + mshort(total) + "</td><td></td></tr></tfoot></table>";
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
      ? "<table class='mov'><thead><tr><th>Movimiento</th><th class='r'>Importe €</th><th></th></tr></thead><tbody>" +
        movs.map(function (x) {
          var neg = x.type === "gasto";
          var subt = fmtDate(x.date) + (x.note ? " · " + esc(x.note) : "");
          return "<tr><td><div class='mname'>" + esc(x.cat) + "</div><div class='msub muted'>" + subt + "</div></td>" +
            "<td class='r num " + (neg ? "amt-neg" : "amt-pos") + "' style='white-space:nowrap'>" + (neg ? "−" : "+") + mshort(Number(x.amount)) + "</td>" +
            "<td class='r' style='white-space:nowrap'><button class='edit' data-id='" + esc(x.id) + "' aria-label='Editar movimiento'>✎</button>" +
            "<button class='del' data-id='" + esc(x.id) + "' aria-label='Borrar movimiento'>✕</button></td></tr>";
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
    renderBackup();
    renderCharts();
  }

  var importDone = true;

  function ckey(s) { return String(s == null ? "" : s).trim().toLowerCase(); }
  function catLoad() {
    try {
      var c = JSON.parse(localStorage.getItem(CAT_KEY) || "null");
      if (c && Array.isArray(c.gasto) && Array.isArray(c.ingreso)) return c;
    } catch (e) {}
    return null;
  }
  function catSave(silent) {
    try { localStorage.setItem(CAT_KEY, JSON.stringify(cats)); } catch (e) {}
    if (!silent) bump();
  }
  function cleanList(arr) {
    var seen = {}, out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (c) {
      var s = String(c == null ? "" : c).trim().replace(/\s+/g, " ").slice(0, 30), k = ckey(s);
      if (s && !seen[k]) { seen[k] = 1; out.push(s); }
    });
    return out;
  }
  /* mantiene la lista de categorías al día: crea la primera vez, añade las que aparecen en los movimientos y las ancladas */
  function syncCats() {
    var changed = false;
    if (!cats) {
      cats = catLoad();
      if (!cats) {
        if (state.items.length) {
          var f = { gasto: {}, ingreso: {} };
          state.items.forEach(function (x) {
            if (!f[x.type]) return;
            var k = ckey(x.cat); if (!k) return;
            if (!f[x.type][k]) f[x.type][k] = { n: 0, name: String(x.cat).trim() };
            f[x.type][k].n++;
          });
          cats = { gasto: [], ingreso: [] };
          ["gasto", "ingreso"].forEach(function (t) {
            cats[t] = Object.keys(f[t]).map(function (k) { return f[t][k]; }).sort(function (p, q) { return q.n - p.n; }).map(function (o) { return o.name; });
          });
        } else cats = { gasto: DEFAULTS.gasto.slice(), ingreso: DEFAULTS.ingreso.slice() };
        changed = true;
      }
    }
    state.items.forEach(function (x) {
      var t = x.type, k = ckey(x.cat);
      if (!cats[t] || !k) return;
      if (!cats[t].some(function (c) { return ckey(c) === k; })) { cats[t].push(String(x.cat).trim()); changed = true; }
    });
    /* primera vez con estrellas: se anclan las 8 más usadas de cada tipo, igual que los atajos de antes */
    if (!cats.pins || !Array.isArray(cats.pins.gasto) || !Array.isArray(cats.pins.ingreso)) {
      var use = { gasto: {}, ingreso: {} };
      state.items.forEach(function (x) { if (use[x.type]) { var k = ckey(x.cat); use[x.type][k] = (use[x.type][k] || 0) + 1; } });
      cats.pins = { gasto: [], ingreso: [] };
      ["gasto", "ingreso"].forEach(function (t) {
        cats[t] = cats[t].slice().sort(function (p, q) { return (use[t][ckey(q)] || 0) - (use[t][ckey(p)] || 0); });
        cats.pins[t] = cats[t].slice(0, 8).map(ckey);
      });
      changed = true;
    }
    ["gasto", "ingreso"].forEach(function (t) {
      var keys = cats[t].map(ckey), before = cats.pins[t].length;
      cats.pins[t] = cats.pins[t].filter(function (k, i, arr) { return keys.indexOf(k) >= 0 && arr.indexOf(k) === i; });
      if (cats.pins[t].length !== before) changed = true;
    });
    if (changed) catSave(true);
  }
  function isPinned(t, name) { return cats.pins[t].indexOf(ckey(name)) >= 0; }

  function renderCats() {
    syncCats();
    var t = state.type;
    $("catList").innerHTML = cats[t].map(function (c) { return '<option value="' + esc(c) + '"></option>'; }).join("");
    var quick = cats[t].filter(function (c) { return isPinned(t, c); });
    $("chips").innerHTML = quick.length
      ? quick.map(function (c) { return '<button type="button" class="chip" data-cat="' + esc(c) + '">' + esc(c) + "</button>"; }).join("")
      : (cats[t].length ? '<span class="muted small">Toca ≡ y marca con ★ las categorías que quieras tener a mano.</span>' : "");
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
    $("cat").placeholder = t === "gasto" ? "Gasolina, Comida, Uni…" : "Paga, Beca…";
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
    var existing = (cats ? cats[state.type] : []).concat(state.items.map(function (x) { return String(x.cat).trim(); }))
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

  /* ---------- gestor de categorías ---------- */
  var catTab = "gasto", catEdit = null, catDel = null;
  function fallbackName(t) { return t === "gasto" ? "Otros" : "Otros ingresos"; }
  function catUsage(t, name) { var k = ckey(name); return state.items.filter(function (x) { return x.type === t && ckey(x.cat) === k; }).length; }
  function catFind(t, name) { var k = ckey(name); return cats[t].filter(function (c) { return ckey(c) === k; })[0]; }
  function catMsg(text, ok) { var m = $("catMsg"); m.textContent = text || ""; m.className = ok ? "msg ok" : "msg"; }
  function openCats() { syncCats(); catTab = state.type; catEdit = null; catDel = null; catMsg(""); $("catSheet").hidden = false; renderCatMgr(); }
  function closeCats() { $("catSheet").hidden = true; catEdit = null; catDel = null; renderCats(); try { $("catMenu").focus(); } catch (e) {} }
  function renderCatMgr() {
    $("catTabGasto").setAttribute("aria-pressed", catTab === "gasto");
    $("catTabIngreso").setAttribute("aria-pressed", catTab === "ingreso");
    $("catNew").placeholder = catTab === "gasto" ? "Nueva categoría de gasto" : "Nueva categoría de ingreso";
    var list = cats[catTab];
    if (!list.length) { $("catList2").innerHTML = '<li class="muted">No hay categorías. Añade la primera arriba.</li>'; return; }
    $("catList2").innerHTML = list.map(function (c, i) {
      var k = ckey(c), n = catUsage(catTab, c), ak = esc(k), pin = isPinned(catTab, c);
      if (catEdit === k) return "<li data-k='" + ak + "'><input type='text' class='cedit' maxlength='30' value='" + esc(c) + "' aria-label='Nuevo nombre'><button type='button' class='ib ok' data-act='save' aria-label='Guardar nombre'>✓</button><button type='button' class='ib' data-act='cancel' aria-label='Cancelar'>✕</button></li>";
      if (catDel === k) return "<li class='confirm' data-k='" + ak + "'><div class='cwarn'>«" + esc(c) + "» tiene " + n + (n === 1 ? " movimiento" : " movimientos") + ". Pasarán a «" + esc(fallbackName(catTab)) + "».</div><button type='button' class='ghost' data-act='cancel'>Cancelar</button><button type='button' class='primary' data-act='delok'>Borrar</button></li>";
      return "<li data-k='" + ak + "'>" +
        "<button type='button' class='ib star" + (pin ? " on" : "") + "' data-act='pin' aria-pressed='" + pin + "' aria-label='" + (pin ? "Quitar de las categorías a mano" : "Tener esta categoría a mano") + "'>" + (pin ? "★" : "☆") + "</button>" +
        "<div class='cinfo'><div class='cname'>" + esc(c) + "</div><div class='csub muted'>" + n + " mov.</div></div>" +
        "<button type='button' class='ib' data-act='up' aria-label='Subir'" + (i === 0 ? " disabled" : "") + ">▲</button>" +
        "<button type='button' class='ib' data-act='down' aria-label='Bajar'" + (i === list.length - 1 ? " disabled" : "") + ">▼</button>" +
        "<button type='button' class='ib' data-act='edit' aria-label='Cambiar nombre'>✎</button>" +
        "<button type='button' class='ib danger' data-act='del' aria-label='Borrar categoría'>✕</button></li>";
    }).join("");
  }
  function focusAct(k, acts) {
    var lis = $("catList2").querySelectorAll("li");
    for (var i = 0; i < lis.length; i++) {
      if (lis[i].getAttribute("data-k") !== k) continue;
      for (var j = 0; j < acts.length; j++) {
        var b = lis[i].querySelector("[data-act='" + acts[j] + "']");
        if (b && !b.disabled) { try { b.focus(); } catch (e) {} return; }
      }
    }
  }
  function togglePin(name) {
    var t = catTab, k = ckey(name), p = cats.pins[t], i = p.indexOf(k);
    if (i >= 0) p.splice(i, 1); else p.push(k);
    catSave(false); renderCatMgr(); renderCats(); focusAct(k, ["pin"]);
  }
  function moveCat(name, dir) {
    var t = catTab, i = cats[t].indexOf(name), j = i + dir;
    if (i < 0 || j < 0 || j >= cats[t].length) return;
    var tmp = cats[t][i]; cats[t][i] = cats[t][j]; cats[t][j] = tmp;
    catSave(false); renderCatMgr(); renderCats();
    focusAct(ckey(name), dir < 0 ? ["up", "down"] : ["down", "up"]);
  }
  function renameCat(oldName, raw) {
    var nn = String(raw || "").trim().replace(/\s+/g, " ");
    if (!nn) { catMsg("Escribe un nombre."); return; }
    var t = catTab, ok = ckey(oldName), canon = nn, merged = false;
    if (ckey(nn) !== ok) { var ex = catFind(t, nn); if (ex) { canon = ex; merged = true; } }
    var changed = state.items.filter(function (x) { return x.type === t && ckey(x.cat) === ok; }).map(function (x) { return Object.assign({}, x, { cat: canon }); });
    var idx = cats[t].findIndex(function (c) { return ckey(c) === ok; });
    var wasPinned = cats.pins[t].indexOf(ok) >= 0;
    if (merged) cats[t].splice(idx, 1); else cats[t][idx] = canon;
    cats.pins[t] = cats.pins[t].filter(function (k) { return k !== ok; });
    if (cats.colors && cats.colors[t] && cats.colors[t][ok]) { var oc = cats.colors[t][ok]; delete cats.colors[t][ok]; if (!cats.colors[t][ckey(canon)]) cats.colors[t][ckey(canon)] = oc; }
    if (wasPinned && cats.pins[t].indexOf(ckey(canon)) < 0) cats.pins[t].push(ckey(canon));
    catSave(false); catEdit = null;
    if (changed.length) store.addMany(changed);
    catMsg(merged ? "Unidas en «" + canon + "»." : "Nombre cambiado.", true);
    renderCatMgr(); render();
  }
  function deleteCat(name, confirmed) {
    var t = catTab, k = ckey(name), n = catUsage(t, name), fb = fallbackName(t);
    if (k === ckey(fb) && n > 0) { catMsg("«" + fb + "» tiene movimientos y no se puede borrar. Puedes cambiarle el nombre."); return; }
    if (n > 0 && !confirmed) { catDel = k; renderCatMgr(); return; }
    var moved = [];
    if (n > 0) {
      var target = catFind(t, fb);
      if (!target) { target = fb; cats[t].push(fb); }
      moved = state.items.filter(function (x) { return x.type === t && ckey(x.cat) === k; }).map(function (x) { return Object.assign({}, x, { cat: target }); });
    }
    cats[t] = cats[t].filter(function (c) { return ckey(c) !== k; });
    cats.pins[t] = cats.pins[t].filter(function (x) { return x !== k; });
    if (cats.colors && cats.colors[t]) delete cats.colors[t][k];
    catSave(false); catDel = null;
    if (moved.length) store.addMany(moved);
    catMsg("Categoría borrada" + (n ? ". " + n + (n === 1 ? " movimiento pasó" : " movimientos pasaron") + " a «" + fb + "»." : "."), true);
    renderCatMgr(); render();
  }
  $("catMenu").addEventListener("click", openCats);
  $("catClose").addEventListener("click", closeCats);
  $("catSheet").addEventListener("click", function (e) { if (e.target === $("catSheet")) closeCats(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("catSheet").hidden) closeCats(); });
  $("catTabGasto").addEventListener("click", function () { catTab = "gasto"; catEdit = null; catDel = null; catMsg(""); renderCatMgr(); });
  $("catTabIngreso").addEventListener("click", function () { catTab = "ingreso"; catEdit = null; catDel = null; catMsg(""); renderCatMgr(); });
  $("catAddForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = $("catNew").value.trim().replace(/\s+/g, " ");
    if (!v) { catMsg("Escribe un nombre."); return; }
    if (catFind(catTab, v)) { catMsg("Esa categoría ya existe."); return; }
    cats[catTab].push(v); catSave(false);
    $("catNew").value = ""; catMsg("«" + v + "» añadida.", true);
    renderCatMgr(); renderCats();
  });
  $("catList2").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]"); if (!b) return;
    var li = b.closest("li"), k = li.getAttribute("data-k"), act = b.getAttribute("data-act"), name = catFind(catTab, k);
    if (!name) return;
    catMsg("");
    if (act === "edit") { catEdit = k; catDel = null; renderCatMgr(); var inp = $("catList2").querySelector(".cedit"); if (inp) { inp.focus(); inp.select(); } }
    else if (act === "cancel") { catEdit = null; catDel = null; renderCatMgr(); }
    else if (act === "save") renameCat(name, li.querySelector(".cedit").value);
    else if (act === "pin") togglePin(name);
    else if (act === "up") moveCat(name, -1);
    else if (act === "down") moveCat(name, 1);
    else if (act === "del") deleteCat(name, false);
    else if (act === "delok") deleteCat(name, true);
  });
  $("catList2").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.classList.contains("cedit")) { e.preventDefault(); var sv = e.target.parentNode.querySelector("[data-act='save']"); if (sv) sv.click(); }
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
    var m = metaGet(); m.backupRev = m.rev || 0; m.backupAt = ts || Date.now(); m.backupCount = state.items.length; metaSet(m);
  }
  var pendingMode = null, awaitingShortcut = 0;
  function buildBackup(pretty) {
    return JSON.stringify({ app: "cuentas-del-mes", version: 1, exportedAt: new Date().toISOString(), items: state.items, categories: cats }, null, pretty ? 1 : 0);
  }
  function exportBackup(mode) {
    var msg = $("backupMsg"); msg.textContent = ""; msg.className = "msg";
    $("exportConfirm").hidden = true;
    if (!state.items.length) { msg.textContent = "No hay movimientos que guardar. Si estás en un móvil nuevo, usa Restaurar copia."; return; }
    var m = metaGet();
    if (m.backupCount && state.items.length < m.backupCount * 0.8) {
      $("exportConfirmText").textContent = "Ahora tienes " + state.items.length + " movimientos y la última copia tenía " + m.backupCount + ". Si exportas, el archivo nuevo sustituirá al anterior y esa diferencia se perderá. ¿Seguro?";
      pendingMode = mode === "shortcut" ? "shortcut" : "share";
      $("exportConfirm").hidden = false; return;
    }
    if (mode === "shortcut") runShortcut(); else doExport();
  }
  async function doExport() {
    var msg = $("backupMsg"); msg.textContent = ""; msg.className = "msg ok";
    var d0 = new Date(), name = "cuentas-" + todayStr() + "_" + pad(d0.getHours()) + "-" + pad(d0.getMinutes()) + ".json";
    var json = buildBackup(true);
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
    msg.textContent = "Copia lista: " + name + ". Guárdala en iCloud Drive.";
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
  $("exportGo").addEventListener("click", function () {
    $("exportConfirm").hidden = true;
    if (pendingMode === "shortcut") runShortcut(); else doExport();
  });
  async function runShortcut() {
    var msg = $("backupMsg"); msg.className = "msg"; msg.textContent = "";
    try { await navigator.clipboard.writeText(buildBackup(false)); }
    catch (e) { msg.textContent = "No se pudo copiar los datos. Usa Exportar copia."; return; }
    awaitingShortcut = Date.now();
    window.location.href = "shortcuts://run-shortcut?name=" + encodeURIComponent("Guardar cuentas") + "&input=clipboard";
  }
  $("shortcutBtn").addEventListener("click", function () { exportBackup("shortcut"); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible" || !awaitingShortcut) return;
    var recent = Date.now() - awaitingShortcut < 5 * 60 * 1000;
    awaitingShortcut = 0;
    if (recent) $("shortcutAsk").hidden = false;
  });
  $("shortcutYes").addEventListener("click", function () {
    $("shortcutAsk").hidden = true; markBackup();
    var msg = $("backupMsg"); msg.className = "msg ok"; msg.textContent = "Copia marcada como hecha.";
    renderBackup(); renderStatus();
  });
  $("shortcutNo").addEventListener("click", function () {
    $("shortcutAsk").hidden = true;
    var msg = $("backupMsg"); msg.className = "msg";
    msg.textContent = "No cuenta como copia. Revisa que el atajo se llame «Guardar cuentas» o usa Exportar copia.";
  });
  $("exportCancel").addEventListener("click", function () { $("exportConfirm").hidden = true; });
  $("restoreInput").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var msg = $("backupMsg"); msg.className = "msg"; msg.textContent = "";
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        var list = (Array.isArray(data) ? data : data.items).map(cleanItem).filter(Boolean);
        if (!list.length) throw new Error("vacio");
        pendingRestore = { list: list, at: data.exportedAt ? Date.parse(data.exportedAt) : null, cats: (!Array.isArray(data) && data.categories) ? data.categories : null };
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
    syncCats();
    if (p.cats) {
      var inPins = (p.cats.pins && Array.isArray(p.cats.pins.gasto) && Array.isArray(p.cats.pins.ingreso)) ? p.cats.pins : null;
      var newPins = { gasto: [], ingreso: [] };
      ["gasto", "ingreso"].forEach(function (t) {
        var incoming = cleanList(p.cats[t]);
        cats[t] = replace ? incoming : cleanList(cats[t].concat(incoming));
        var ip = inPins ? inPins[t].map(ckey) : [];
        newPins[t] = replace ? ip : cats.pins[t].concat(ip).filter(function (k, i, arr) { return arr.indexOf(k) === i; });
      });
      cats.pins = (replace && !inPins) ? null : newPins;
      catSave(true);
    } else if (replace) { cats = null; try { localStorage.removeItem(CAT_KEY); } catch (e) {} }
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

  /* ---------- gráficas ---------- */
  var cv = { type: "gasto", scope: "todo", sel: null, open: null, allHabs: false };
  var view = "resumen";
  var SLOTS = 7;
  var STOP = {};
  ("de la el los las un una unos unas y e o u a en con sin por para del al que se su sus mi mis tu lo le les es no si ya mas como pero este esta estos estas eso ese esa the and").split(" ").forEach(function (w) { STOP[w] = 1; });

  function nrm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zñ\s]/g, " ").replace(/\s+/g, " ").trim(); }
  function tokens(s) {
    var seen = {}, out = [];
    nrm(s).split(" ").forEach(function (w) { if (w.length >= 3 && !STOP[w] && !seen[w]) { seen[w] = 1; out.push(w); } });
    return out;
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function m3(key) { return cap(MESES[+key.split("-")[1] - 1].slice(0, 3)); }
  function axisNum(n) { return n >= 1000 ? (n / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + "k" : String(Math.round(n)); }
  function pctLabel(p) { return p > 0 && p < 1 ? "<1%" : Math.round(p) + "%"; }

  /* cada categoría conserva su color (hueco 1-7); las demás van en gris */
  function ensureColors(t) {
    if (!cats || !state.items.length) return {};
    if (!cats.colors || typeof cats.colors !== "object") cats.colors = {};
    var map = cats.colors[t];
    if (!map || typeof map !== "object") map = cats.colors[t] = {};
    var valid = {}; cats[t].forEach(function (c) { valid[ckey(c)] = 1; });
    var changed = false, used = {};
    Object.keys(map).forEach(function (k) {
      var s = map[k];
      if (!valid[k] || !(s >= 1 && s <= SLOTS) || used[s]) { delete map[k]; changed = true; } else used[s] = 1;
    });
    var tot = {};
    state.items.forEach(function (x) { if (x.type === t) { var k = ckey(x.cat); tot[k] = (tot[k] || 0) + (Number(x.amount) || 0); } });
    Object.keys(tot).sort(function (a, b) { return tot[b] - tot[a]; }).forEach(function (k) {
      if (map[k] || !valid[k] || tot[k] <= 0) return;
      for (var s = 1; s <= SLOTS; s++) if (!used[s]) { map[k] = s; used[s] = 1; changed = true; break; }
    });
    if (changed) catSave(true);
    return map;
  }
  function colorOf(map, k) { return map[k] ? "var(--c" + map[k] + ")" : "var(--n1)"; }

  function polar(cx, cy, r, a) { var t = (a - 90) * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; }
  function donutPath(cx, cy, R, r, a0, a1) {
    var p0 = polar(cx, cy, R, a0), p1 = polar(cx, cy, R, a1), q1 = polar(cx, cy, r, a1), q0 = polar(cx, cy, r, a0);
    var big = a1 - a0 > 180 ? 1 : 0;
    function f(p) { return p[0].toFixed(2) + " " + p[1].toFixed(2); }
    return "M" + f(p0) + "A" + R + " " + R + " 0 " + big + " 1 " + f(p1) + "L" + f(q1) + "A" + r + " " + r + " 0 " + big + " 0 " + f(q0) + "Z";
  }
  function barPath(x, y, w, h, r) {
    if (h <= 0) return "";
    r = Math.min(r, w / 2, h);
    return "M" + x + " " + (y + h) + "V" + (y + r) + "Q" + x + " " + y + " " + (x + r) + " " + y + "H" + (x + w - r) + "Q" + (x + w) + " " + y + " " + (x + w) + " " + (y + r) + "V" + (y + h) + "Z";
  }
  function niceMax(v) {
    if (v <= 0) return 10;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  function monthsRange(n) {
    if (!state.items.length) return [];
    var last = state.items.map(function (x) { return x.date.slice(0, 7); }).sort().pop();
    if (state.month > last) last = state.month;
    var out = []; for (var i = n - 1; i >= 0; i--) out.push(shiftMonth(last, -i));
    var first = state.items.map(function (x) { return x.date.slice(0, 7); }).sort()[0];
    while (out.length > 1 && out[0] < first && out[0] < shiftMonth(first, 0)) out.shift();
    return out;
  }
  function monthTotals(months, type, catKey) {
    var m = {}; months.forEach(function (k) { m[k] = 0; });
    state.items.forEach(function (x) {
      if (type && x.type !== type) return;
      if (catKey && ckey(x.cat) !== catKey) return;
      var k = x.date.slice(0, 7); if (k in m) m[k] += Number(x.amount) || 0;
    });
    return m;
  }

  /* columnas de un solo color, para una categoría: gasto mes a mes */
  function miniBars(months, vals, color, label) {
    var W = 300, H = 120, L = 30, T = 14, B = 20, pw = W - L - 4, ph = H - T - B;
    var max = niceMax(Math.max.apply(null, months.map(function (k) { return vals[k]; }).concat([0])));
    var slot = pw / months.length, bw = Math.min(24, slot - 6), s = "";
    [0, 0.5, 1].forEach(function (f) {
      var y = T + ph - ph * f;
      s += '<line class="' + (f === 0 ? "axis" : "grid") + '" x1="' + L + '" x2="' + (W - 4) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="ax" x="' + (L - 4) + '" y="' + (y + 3.5) + '" text-anchor="end">' + axisNum(max * f) + "</text>";
    });
    var peak = months.reduce(function (a, k) { return vals[k] > vals[a] ? k : a; }, months[0]);
    months.forEach(function (k, i) {
      var x = L + slot * i + (slot - bw) / 2, h = vals[k] / max * ph, sel = k === state.month;
      if (sel) s += '<rect class="hl" x="' + (L + slot * i) + '" y="' + T + '" width="' + slot + '" height="' + ph + '"/>';
      s += '<path d="' + barPath(x, T + ph - h, bw, h, 4) + '" fill="' + color + '"/>';
      if (k === peak && vals[k] > 0) s += '<text class="vl" x="' + (x + bw / 2) + '" y="' + (T + ph - h - 4) + '" text-anchor="middle">' + axisNum(vals[k]) + "</text>";
      s += '<text class="ax' + (sel ? " sel" : "") + '" x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + m3(k) + "</text>";
      s += '<rect class="hit" x="' + (L + slot * i) + '" y="0" width="' + slot + '" height="' + H + '" data-m="' + k + '" tabindex="0" role="button" aria-label="' + esc(label + ", " + monthName(k) + ": " + money(vals[k])) + '"/>';
    });
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="group" aria-label="' + esc(label) + '">' + s + "</svg>";
  }

  /* hábitos: agrupa las notas parecidas y suma lo que sueles gastar en cada cosa */
  function habits(items) {
    var groups = {};
    items.forEach(function (x) {
      var key = tokens(x.note).join(" ");
      var g = groups[key] || (groups[key] = { key: key, total: 0, n: 0, last: "", names: {}, items: [] });
      var amt = Number(x.amount) || 0;
      g.total += amt; g.n++; g.items.push(x);
      if (x.date > g.last) g.last = x.date;
      var nm = String(x.note || "").trim();
      if (nm) g.names[nm] = (g.names[nm] || 0) + 1;
    });
    return Object.keys(groups).map(function (k) {
      var g = groups[k], nms = Object.keys(g.names).sort(function (a, b) { return g.names[b] - g.names[a] || a.length - b.length; });
      g.name = k ? nms[0] : "Sin nota"; g.more = k ? nms.slice(1, 3) : [];
      g.avg = g.total / g.n; return g;
    }).sort(function (a, b) { return (a.key ? 0 : 1) - (b.key ? 0 : 1) || b.total - a.total; });
  }
  var lastHabs = {};
  function catOptions(t, cur) {
    return cats[t].map(function (c) { return '<option value="' + esc(c) + '"' + (ckey(c) === ckey(cur) ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("");
  }
  function moveItems(list, t, to) {
    var canon = catFind(t, to); if (!canon || !list.length) return;
    store.addMany(list.map(function (x) { return Object.assign({}, x, { cat: canon }); }));
  }

  function renderCharts() {
    if (view !== "graficas") return;
    syncCats();
    var t = cv.type, isG = t === "gasto";
    $("chGasto").setAttribute("aria-pressed", isG); $("chIngreso").setAttribute("aria-pressed", !isG);
    $("chMes").setAttribute("aria-pressed", cv.scope === "mes"); $("chTodo").setAttribute("aria-pressed", cv.scope === "todo");
    $("pieTitle").textContent = (isG ? "Gastos" : "Ingresos") + " por categoría";
    $("pieScope").textContent = cv.scope === "mes" ? monthName(state.month) : "Todo el historial";
    var cmap = ensureColors(t);

    var all = state.items.filter(function (x) { return x.type === t; });
    var scoped = cv.scope === "mes" ? all.filter(function (x) { return x.date.slice(0, 7) === state.month; }) : all;
    var rows = groupByCat(scoped).filter(function (r) { return r.total > 0; });
    var total = rows.reduce(function (a, r) { return a + r.total; }, 0);
    rows.forEach(function (r) { r.k = ckey(r.name); });

    if (!rows.length) {
      $("pie").innerHTML = '<div class="empty">' + (cv.scope === "mes" ? "Sin " + (isG ? "gastos" : "ingresos") + " en " + esc(monthName(state.month)) + "." : "Aún no hay datos.") + "</div>";
      $("rank").innerHTML = ""; $("detail").innerHTML = ""; $("detailPanel").hidden = true;
    } else {
      $("detailPanel").hidden = false;
      if (!cv.sel || !rows.some(function (r) { return r.k === cv.sel; })) cv.sel = rows[0].k;
      var sel = rows.filter(function (r) { return r.k === cv.sel; })[0];
      /* tarta: categorías con color + «Otras» en gris */
      var slices = rows.filter(function (r) { return cmap[r.k]; });
      var restTotal = rows.reduce(function (a, r) { return a + (cmap[r.k] ? 0 : r.total); }, 0);
      var parts = slices.map(function (r) { return { k: r.k, name: r.name, total: r.total, color: colorOf(cmap, r.k) }; });
      if (restTotal > 0) parts.push({ k: "", name: "Otras", total: restTotal, color: "var(--n1)" });
      var s = "", a = 0, gap = parts.length > 1 ? 1.4 : 0;
      parts.forEach(function (p) {
        var span = p.total / total * 360, a0 = a + gap / 2, a1 = a + span - gap / 2, isSel = p.k === cv.sel;
        var R = isSel ? 98 : 92;
        var lbl = esc(p.name + ": " + money(p.total) + ", " + pctLabel(p.total / total * 100));
        var attrs = p.k ? ' class="slice" data-k="' + esc(p.k) + '" tabindex="0" role="button"' : ' class="slice"';
        if (span >= 359.9) s += '<circle ' + attrs + ' cx="100" cy="100" r="' + ((R + 58) / 2) + '" fill="none" stroke="' + p.color + '" stroke-width="' + (R - 58) + '" aria-label="' + lbl + '"/>';
        else s += '<path' + attrs + ' d="' + donutPath(100, 100, R, 58, a0, Math.max(a1, a0 + 0.3)) + '" fill="' + p.color + '" aria-label="' + lbl + '"/>';
        a += span;
      });
      $("pie").innerHTML = '<div class="pie"><svg class="pie-svg" viewBox="0 0 200 200" role="group" aria-label="Reparto por categoría">' + s + "</svg>" +
        '<div class="pie-center"><span class="pc-name">' + esc(sel.name) + '</span><span class="pc-amt">' + mshort(sel.total) + ' €</span><span class="pc-pct muted">' + pctLabel(sel.total / total * 100) + " del total</span></div></div>";

      $("rank").innerHTML = rows.map(function (r) {
        var p = r.total / total * 100;
        return '<li><button type="button" class="rrow' + (r.k === cv.sel ? " sel" : "") + '" data-k="' + esc(r.k) + '" aria-pressed="' + (r.k === cv.sel) + '">' +
          '<i class="sw" style="background:' + colorOf(cmap, r.k) + '"></i><span class="rname"><span class="mname">' + esc(r.name) + '</span><span class="msub muted">' + r.n + (r.n === 1 ? " mov." : " movs.") + '</span></span>' +
          '<span class="ramt num">' + mshort(r.total) + ' €</span><span class="rpct num muted">' + pctLabel(p) + "</span></button></li>";
      }).join("");

      /* detalle de la categoría elegida */
      var catAll = all.filter(function (x) { return ckey(x.cat) === cv.sel; });
      var catScope = scoped.filter(function (x) { return ckey(x.cat) === cv.sel; });
      var months = monthsRange(12), vals = monthTotals(months, t, cv.sel);
      var hbAll = habits(catAll), hb = cv.allHabs ? hbAll : hbAll.slice(0, 8);
      var swc = colorOf(cmap, cv.sel);
      var html = '<div class="dhead"><i class="sw" style="background:' + swc + '"></i><h2>' + esc(sel.name) + "</h2></div>" +
        '<div class="stats"><div class="stat"><span class="eyebrow">Total</span><span class="sv num">' + mshort(sel.total) + ' €</span></div>' +
        '<div class="stat"><span class="eyebrow">Movs.</span><span class="sv num">' + catScope.length + '</span></div>' +
        '<div class="stat"><span class="eyebrow">Media</span><span class="sv num">' + mshort(sel.total / Math.max(catScope.length, 1)) + ' €</span></div></div>' +
        '<h3 class="sub">' + (isG ? "Gasto" : "Ingreso") + " mes a mes</h3>" + miniBars(months, vals, swc, sel.name) +
        '<p class="muted small dcap">Toca un mes para verlo.</p>' +
        '<h3 class="sub">' + (isG ? "Lo que sueles gastar aquí" : "Lo que sueles recibir aquí") + "</h3>" +
        '<ul class="habs">' + hb.map(function (g) {
          var open = cv.open === g.key;
          lastHabs[g.key] = g;
          var head = "<button type='button' class='hrow' data-hk='" + esc(g.key) + "' aria-expanded='" + open + "'><span class='hname'>" + esc(g.name) + "</span><span class='hsum'>" + mshort(g.total) + " €</span>" +
            "<span class='hsub'>" + (g.more.length ? "también: " + esc(g.more.join(", ")) : "&nbsp;") + "</span>" +
            "<span class='hmeta'>" + g.n + (g.n === 1 ? " vez" : " veces") + " · media " + mshort(g.avg) + " € " + (open ? "▴" : "▾") + "</span></button>";
          var panel = "";
          if (open) {
            var its = g.items.slice().sort(function (p, q) { return p.date < q.date ? 1 : -1; });
            panel = "<div class='hpanel'><label class='mvall'>Mover todo a otra categoría<select data-all='" + esc(g.key) + "'><option value=''>Elegir categoría…</option>" + catOptions(t, "") + "</select></label>" +
              "<ul class='mvs'>" + its.map(function (x) {
                return "<li><span class='mvd'>" + fmtDate(x.date) + (x.note ? " · " + esc(x.note) : "") + "</span><span class='num mva'>" + mshort(Number(x.amount)) + " €</span>" +
                  "<select data-id='" + esc(x.id) + "' aria-label='Categoría de este movimiento'>" + catOptions(t, x.cat) + "</select></li>";
              }).join("") + "</ul></div>";
          }
          return "<li class='hab'>" + head + panel + "</li>";
        }).join("") + "</ul>" +
        (hbAll.length > 8 ? '<button type="button" class="ghost hmore" data-more="1">' + (cv.allHabs ? "Ver menos" : "Ver todos (" + hbAll.length + ")") + "</button>" : "");
      $("detail").innerHTML = html;
    }

    /* barras ingresos vs gastos por mes */
    var ms = monthsRange(12);
    if (!ms.length) { $("bars").innerHTML = '<div class="empty">Aún no hay datos.</div>'; $("barsInfo").innerHTML = ""; $("barsTable").innerHTML = ""; return; }
    var inc = monthTotals(ms, "ingreso"), exp = monthTotals(ms, "gasto");
    var W = 300, H = 190, L = 32, T = 14, B = 20, pw = W - L - 4, ph = H - T - B;
    var max = niceMax(Math.max.apply(null, ms.map(function (k) { return Math.max(inc[k], exp[k]); })));
    var slot = pw / ms.length, bw = Math.min(10, (slot - 5) / 2), g = "";
    [0, 0.5, 1].forEach(function (f) {
      var y = T + ph - ph * f;
      g += '<line class="' + (f === 0 ? "axis" : "grid") + '" x1="' + L + '" x2="' + (W - 4) + '" y1="' + y + '" y2="' + y + '"/><text class="ax" x="' + (L - 4) + '" y="' + (y + 3.5) + '" text-anchor="end">' + axisNum(max * f) + "</text>";
    });
    ms.forEach(function (k, i) {
      var cx = L + slot * i + slot / 2, sel = k === state.month;
      if (sel) g += '<rect class="hl" x="' + (L + slot * i) + '" y="' + T + '" width="' + slot + '" height="' + ph + '"/>';
      var hi = inc[k] / max * ph, he = exp[k] / max * ph;
      g += '<path class="b-pos" d="' + barPath(cx - bw - 1, T + ph - hi, bw, hi, 3) + '"/><path class="b-neg" d="' + barPath(cx + 1, T + ph - he, bw, he, 3) + '"/>';
      g += '<text class="ax' + (sel ? " sel" : "") + '" x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle">' + m3(k) + "</text>";
      g += '<rect class="hit" x="' + (L + slot * i) + '" y="0" width="' + slot + '" height="' + H + '" data-m="' + k + '" tabindex="0" role="button" aria-label="' + esc(monthName(k) + ": ingresos " + money(inc[k]) + ", gastos " + money(exp[k])) + '"/>';
    });
    $("bars").innerHTML = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="group" aria-label="Ingresos y gastos por mes">' + g + "</svg>";
    var si = state.month in inc ? inc[state.month] : sum(state.items.filter(function (x) { return x.type === "ingreso" && x.date.slice(0, 7) === state.month; }));
    var se = state.month in exp ? exp[state.month] : sum(state.items.filter(function (x) { return x.type === "gasto" && x.date.slice(0, 7) === state.month; }));
    $("barsInfo").innerHTML = '<div class="binfo"><b>' + esc(cap(monthName(state.month))) + "</b><br>Ingresos <b class='num'>" + money(si) + "</b> · Gastos <b class='num'>" + money(se) + "</b> · Balance <b class='num'>" + (si - se > 0 ? "+" : "") + money(si - se) + "</b></div>";
    $("barsTable").innerHTML = "<table><thead><tr><th>Mes</th><th class='r'>Ingresos €</th><th class='r'>Gastos €</th><th class='r'>Balance €</th></tr></thead><tbody>" +
      ms.map(function (k) { var d = inc[k] - exp[k]; return "<tr><td style='white-space:nowrap'>" + m3(k) + " ’" + k.slice(2, 4) + "</td><td class='r num amt-pos'>" + mshort(inc[k]) + "</td><td class='r num amt-neg'>" + mshort(exp[k]) + "</td><td class='r num " + (d < 0 ? "amt-neg" : "amt-pos") + "'>" + mshort(d) + "</td></tr>"; }).join("") + "</tbody></table>";
  }

  function setView(v) {
    view = v;
    $("viewResumen").hidden = v !== "resumen"; $("viewGraficas").hidden = v !== "graficas";
    $("tabResumen").setAttribute("aria-selected", v === "resumen"); $("tabGraficas").setAttribute("aria-selected", v === "graficas");
    if (v === "graficas") renderCharts();
    window.scrollTo(0, 0);
  }
  $("tabResumen").addEventListener("click", function () { setView("resumen"); });
  $("tabGraficas").addEventListener("click", function () { setView("graficas"); });
  $("chGasto").addEventListener("click", function () { cv.type = "gasto"; cv.sel = null; renderCharts(); });
  $("chIngreso").addEventListener("click", function () { cv.type = "ingreso"; cv.sel = null; renderCharts(); });
  $("chMes").addEventListener("click", function () { cv.scope = "mes"; renderCharts(); });
  $("chTodo").addEventListener("click", function () { cv.scope = "todo"; renderCharts(); });
  function pickCat(e) { var el = e.target.closest("[data-k]"); if (!el || !el.getAttribute("data-k")) return; cv.sel = el.getAttribute("data-k"); renderCharts(); }
  $("pie").addEventListener("click", pickCat);
  $("pie").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickCat(e); } });
  $("rank").addEventListener("click", pickCat);
  function pickMonth(e, scope) {
    var el = e.target.closest("[data-m]"); if (!el) return;
    state.month = el.getAttribute("data-m"); if (scope) cv.scope = "mes";
    render();
  }
  $("bars").addEventListener("click", function (e) { pickMonth(e, true); });
  $("detail").addEventListener("click", function (e) {
    if (e.target.closest("[data-more]")) { cv.allHabs = !cv.allHabs; renderCharts(); return; }
    var hr = e.target.closest(".hrow");
    if (hr) { var k = hr.getAttribute("data-hk"); cv.open = cv.open === k ? null : k; renderCharts(); return; }
    pickMonth(e, false);
  });
  $("detail").addEventListener("change", function (e) {
    var s = e.target; if (s.tagName !== "SELECT" || !s.value) return;
    var t = cv.type;
    if (s.hasAttribute("data-id")) {
      var it = state.items.filter(function (x) { return x.id === s.getAttribute("data-id"); })[0];
      if (it) moveItems([it], t, s.value);
    } else if (s.hasAttribute("data-all")) {
      var g = lastHabs[s.getAttribute("data-all")];
      if (g) { cv.open = null; moveItems(g.items, t, s.value); }
    }
  });
  ["bars", "detail"].forEach(function (id) {
    $(id).addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickMonth(e, id === "bars"); } });
  });

  $("date").value = todayStr();
  setType("gasto");
  init();
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}

