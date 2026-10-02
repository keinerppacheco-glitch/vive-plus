// Servidor de demo: sin dependencias (solo Node 16+). Base de datos = db.json
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "db.json");
const PUB = path.join(__dirname, "public");

let db = { siguiente: 1, cuentas: [] };
try { db = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch (e) {}
db.mov = db.mov || [];
db.zonas = db.zonas || { "MONTELIBANO": [], "TIERALTA": [], "PLANETA RICA": [], "PUEBLO NUEVO": [], "PUERTO LIBERTADOR": [], "LORICA": [] };
db.cobs = db.cobs || ["ALEXANDER","ANDRES","CESAR","DIEGO","ELKIN","GERMAN","JOSE LUIS","JOSE YAIR","JUAN"]; db.prest = db.prest || []; db.vends = db.vends || ["Andrés Gómez"]; db.jor = db.jor || {}; db.bloq = db.bloq || {}; db.falt = db.falt || []; db.cierre = db.cierre || {};
db.asig = db.asig || {}; // salida del día: { "AAAA-MM-DD": { vendedor: { producto: cantidad } } }
const COMP_FILE = path.join(__dirname, "comprobantes.json");
let comp = { lista: [] };
try { comp = JSON.parse(fs.readFileSync(COMP_FILE, "utf8")); } catch (e) {}
const guardarComp = () => fs.writeFileSync(COMP_FILE, JSON.stringify(comp, null, 2));
const SEMILLA = ["Infasure 700g","Batido Verde 450g","Colamed 700g","Citrato de magnesio 500ml","Prostazan 500ml","Higadosan 500ml","Clorofinat 500ml","Clorofila 500ml","Cero Estres 500ml","Cannabis 500g","Full Men 500ml","Memorin 500ml","Glucosaming 500ml","Pultox 500ml","Gos-Trik","Colageno y Biotina 100Un","Ajo 100Un","Agravit 400ml","Combo X4","Vitamin C","B-Complex 90Un","Dremax 400ml","Cardo Mariano Boldo 250ml","Diabetizan 500ml","Gel mixto calendula 300g","Gax-Plus 300ml","Coenzyme Q-10 30Un"];
if (!db.inv) db.inv = SEMILLA.map((nombre, i) => ({ id: "P" + (i + 1), nombre, costo: 0, stock: 10 }));
const guardar = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
const movInv = (quien, producto, antes, despues, inv, motivo) => db.mov.push({ t: Date.now(), rol: "inventario", quien, tipo: "inventario", inv: inv || "", cliente: "", monto: 0, det: producto + ": " + antes + " → " + despues + " unidades (" + motivo + ")" });
const vendidasDia = (f, v) => { const o = {}; db.cuentas.filter(c => !c.anulada && (c.vend || "Andrés Gómez") === v && c.fecha === f).forEach(c => Object.keys(c.asig || {}).forEach(n => o[n] = (o[n] || 0) + c.asig[n])); return o; };
const rest = (f, v, n) => Math.max((((db.asig[f] || {})[v] || {})[n] || 0) - (vendidasDia(f, v)[n] || 0), 0);
const lunes = f => { const d = new Date(f + "T12:00:00"); if (isNaN(d)) return ""; d.setDate(d.getDate() - (d.getDay() + 1) % 7); return d.toISOString().slice(0, 10); };
const factura = n => "FAC-" + String(n).padStart(6, "0");

const clientes = new Set();
const avisar = tipo => clientes.forEach(r => r.write(`data: ${JSON.stringify({ tipo, t: Date.now() })}\n\n`));

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
const leer = req => new Promise((ok, fail) => {
  let b = ""; req.on("data", c => { b += c; if (b.length > 5e6) { req.destroy(); fail(new Error("grande")); } });
  req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch (e) { fail(e); } });
});

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (u.pathname === "/api/eventos") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write("retry: 2000\n\n"); clientes.add(res); req.on("close", () => clientes.delete(res)); return;
    }
    if (u.pathname === "/api/siguiente" && req.method === "GET") return json(res, 200, { inv: factura(db.siguiente) });
    if (u.pathname === "/api/movimientos" && req.method === "GET") return json(res, 200, db.mov);
    if (u.pathname === "/api/productos" && req.method === "GET") return json(res, 200, db.inv);
    if (u.pathname === "/api/productos" && req.method === "POST") {
      const p = await leer(req), nombre = String(p.nombre || "").trim();
      if (!nombre || db.inv.some(x => x.nombre.toLowerCase() === nombre.toLowerCase())) return json(res, 400, { error: "El nombre está vacío o el producto ya existe." });
      db.inv.push({ id: "P" + (db.inv.length + 1), nombre, costo: Math.max(0, +p.costo || 0), stock: Math.max(0, Math.floor(+p.stock || 0)), pc: Math.max(0, +p.pc || 0), pr: Math.max(0, +p.pr || 0) });
      movInv("Administrador", nombre, 0, db.inv[db.inv.length - 1].stock, "", "producto nuevo"); guardar(); avisar("inv"); return json(res, 201, { ok: true });
    }
    if (u.pathname === "/api/productos/editar" && req.method === "POST") {
      const p = await leer(req), x = db.inv.find(z => z.id === p.id);
      if (!x) return json(res, 404, { error: "No encontrado" });
      const antes = x.stock; if (p.costo != null) x.costo = Math.max(0, +p.costo || 0); if (p.pc != null) x.pc = Math.max(0, +p.pc || 0); if (p.pr != null) x.pr = Math.max(0, +p.pr || 0); x.stock = Math.max(0, Math.floor(+p.stock || 0)); if (x.stock !== antes) movInv("Administrador", x.nombre, antes, x.stock, "", "ajuste manual");
      guardar(); avisar("inv"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/ventas/eliminar" && req.method === "POST") {
      const { inv } = await leer(req), c = db.cuentas.find(x => x.inv === inv && !x.anulada);
      if (!c) return json(res, 404, { error: "Venta no encontrada" });
      c.anulada = true; c.anuladaT = Date.now();
      const ta = { ...(c.asig || {}) }; (c.items || [c.prod]).forEach(n => { if (ta[n] > 0) { ta[n]--; return; } const p = db.inv.find(x => x.nombre === n); if (p) { const a = p.stock; p.stock++; movInv("Administrador", p.nombre, a, p.stock, inv, "venta eliminada"); } });
      comp.lista.filter(x => x.inv === inv).forEach(x => { x.estado = "venta eliminada"; });
      db.mov.push({ t: Date.now(), rol: "administrador", quien: "Administrador", tipo: "eliminada", inv, cliente: c.n, monto: c.total, det: "Venta eliminada · " + c.prod + " devuelto al inventario" });
      guardar(); guardarComp(); avisar("eliminada"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/ventas/editar" && req.method === "POST") {
      const e = await leer(req), c = db.cuentas.find(x => x.inv === e.inv && !x.anulada);
      if (!c) return json(res, 404, { error: "Venta no encontrada" });
      if (e.prod && e.prod !== c.prod && (c.items || [c.prod]).length === 1) {
        const o = db.inv.find(x => x.nombre === c.prod), n = db.inv.find(x => x.nombre === e.prod);
        if (!n) return json(res, 409, { error: "Ese producto no está en el inventario." });
        const dA = rest(c.fecha, c.vend || "Andrés Gómez", n.nombre) > 0, deA = !!(c.asig && c.asig[c.prod] > 0);
        if (!dA && n.stock < 1) return json(res, 409, { error: "Producto agotado: " + n.nombre });
        if (o && !deA) { const ao = o.stock; o.stock++; movInv("Administrador", o.nombre, ao, o.stock, c.inv, "venta corregida"); } if (!dA) { const an = n.stock; n.stock--; movInv("Administrador", n.nombre, an, n.stock, c.inv, "venta corregida"); } c.asig = dA ? { [n.nombre]: 1 } : {}; c.prod = n.nombre; c.items = [n.nombre]; c.costo = n.costo || 0;
      }
      if (e.total > 0 && e.total !== c.total) {
        c.total = e.total; let r = c.total;
        c.h.forEach(x => { if (c.tipo === "contado") { x.m = c.total; x.s = 0; } else { r -= x.m; x.s = Math.max(r, 0); } });
      }
      if (c.tipo !== "contado") { if (e.cuota > 0) c.cuota = e.cuota; if (e.cob) c.cob = e.cob; }
      db.mov.push({ t: Date.now(), rol: "administrador", quien: "Administrador", tipo: "editada", inv: c.inv, cliente: c.n, monto: c.total, det: "Venta corregida · " + c.prod + (c.cob ? " · cobrador " + c.cob : "") });
      guardar(); avisar("editada"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/asignaciones" && req.method === "GET") {
      const f = u.searchParams.get("fecha") || new Date().toISOString().slice(0, 10), vend = u.searchParams.get("vend"), out = [];
      Object.keys(db.asig[f] || {}).filter(v => !vend || v === vend).forEach(v => { const s = vendidasDia(f, v); Object.keys(db.asig[f][v]).forEach(prod => out.push({ fecha: f, vend: v, prod, cant: db.asig[f][v][prod], vendidas: s[prod] || 0, cerrado: !!db.cierre[f + "|" + v] })); });
      return json(res, 200, out);
    }
    if (u.pathname === "/api/asignaciones" && req.method === "POST") {
      const p = await leer(req), f = String(p.fecha || ""), v = String(p.vend || "").trim(), cant = Math.max(0, Math.floor(+p.cant || 0)), pr = db.inv.find(x => x.nombre === p.prod);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !v) return json(res, 400, { error: "Datos incompletos" });
      if (!pr) return json(res, 404, { error: "Producto no encontrado en el inventario." });
      if (db.cierre[f + "|" + v]) return json(res, 409, { error: "Ese día ya está cerrado para " + v + "." });
      const vd = vendidasDia(f, v)[pr.nombre] || 0, antes = ((db.asig[f] || {})[v] || {})[pr.nombre] || 0;
      if (cant < vd) return json(res, 409, { error: v + " ya vendió " + vd + " de " + pr.nombre + "; no puedes dejar menos de " + vd + "." });
      if (cant - antes > pr.stock) return json(res, 409, { error: "Solo hay " + pr.stock + " de " + pr.nombre + " en el inventario." });
      db.asig[f] = db.asig[f] || {}; const mio = db.asig[f][v] = db.asig[f][v] || {};
      if (cant) mio[pr.nombre] = cant; else delete mio[pr.nombre];
      if (!Object.keys(mio).length) delete db.asig[f][v];
      if (!Object.keys(db.asig[f]).length) delete db.asig[f];
      if (cant !== antes) { const a = pr.stock; pr.stock += antes - cant; movInv("Administrador", pr.nombre, a, pr.stock, "", cant > antes ? "asignado a " + v + " para vender el " + f : "devuelto al inventario por " + v); }
      guardar(); avisar("asig"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/zonas" && req.method === "GET") return json(res, 200, db.zonas);
    if (u.pathname === "/api/zonas" && req.method === "POST") {
      const p = await leer(req), z = String(p.zona || "").trim(), cobs = [...new Set((p.cobs || []).map(String).filter(Boolean))];
      if (!z || cobs.length > 2) return json(res, 400, { error: "Cada zona admite máximo 2 cobradores." });
      Object.keys(db.zonas).forEach(k => { if (k !== z) db.zonas[k] = db.zonas[k].filter(x => !cobs.includes(x)); });
      db.zonas[z] = cobs; guardar(); avisar("zona"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/vendedores" && req.method === "GET") return json(res, 200, [...new Set([...db.vends, ...db.cuentas.map(c => c.vend).filter(Boolean), ...Object.values(db.asig).flatMap(d => Object.keys(d))])]);
    if (u.pathname === "/api/vendedores" && req.method === "POST") { const n = String((await leer(req)).nombre || "").trim(); if (!n) return json(res, 400, { error: "Escribe el nombre." }); if (!db.vends.includes(n)) db.vends.push(n); guardar(); avisar("vend"); return json(res, 200, { ok: true }); }
    if (u.pathname === "/api/jornada" && req.method === "GET") { const f = u.searchParams.get("fecha"), c = u.searchParams.get("cob"), j = (db.jor[f] || {})[c] || {}, b = (db.bloq[lunes(f)] || {})[c] || {}; return json(res, 200, { ini: j.ini || 0, fin: j.fin || 0, bi: !!b.bi, bf: !!b.bf }); }
    if (u.pathname === "/api/jornada" && req.method === "POST") {
      const p = await leer(req);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha || "") || !p.cob || !["ini", "fin"].includes(p.accion)) return json(res, 400, { error: "Datos inválidos" });
      const b = (db.bloq[lunes(p.fecha)] || {})[p.cob] || {}, j = ((db.jor[p.fecha] = db.jor[p.fecha] || {})[p.cob] = db.jor[p.fecha][p.cob] || {});
      if (p.accion === "ini") { if (b.bi) return json(res, 409, { error: "El administrador bloqueó el inicio del día." }); j.ini = j.ini || Date.now(); }
      else { if (b.bf) return json(res, 409, { error: "El administrador bloqueó la finalización del día." }); if (!j.ini) return json(res, 409, { error: "Primero inicia el día." }); j.fin = j.fin || Date.now(); }
      db.mov.push({ t: Date.now(), rol: "cobrador", quien: p.cob, tipo: "jornada", inv: "", cliente: "", monto: 0, det: p.accion === "ini" ? "Inició el día de cobro" : "Finalizó el día de cobro" });
      guardar(); avisar("jornada"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/bloqueos" && req.method === "GET") return json(res, 200, db.bloq[lunes(u.searchParams.get("semana") || "")] || {});
    if (u.pathname === "/api/bloqueos" && req.method === "POST") {
      const p = await leer(req), w = lunes(p.semana || "");
      if (!w || !p.cob || !["bi", "bf"].includes(p.k)) return json(res, 400, { error: "Datos inválidos" });
      const o = ((db.bloq[w] = db.bloq[w] || {})[p.cob] = db.bloq[w][p.cob] || {}); o[p.k] = !!p.v;
      db.mov.push({ t: Date.now(), rol: "administrador", quien: "Administrador", tipo: "jornada", inv: "", cliente: "", monto: 0, det: (p.v ? "Bloqueó " : "Habilitó ") + (p.k === "bi" ? "el inicio" : "la finalización") + " del día de cobro de " + p.cob + " · semana del " + w });
      guardar(); avisar("bloq"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/cierre" && req.method === "POST") {
      const { fecha, vend } = await leer(req), A = (db.asig[fecha] || {})[vend];
      if (!A || db.cierre[fecha + "|" + vend]) return json(res, 409, { error: "No hay asignaciones abiertas para ese vendedor y fecha." });
      const vd = vendidasDia(fecha, vend); let n = 0;
      Object.keys(A).forEach(pr => { const r = A[pr] - (vd[pr] || 0); if (r > 0) { n += r; db.falt.push({ id: "F" + Date.now() + "_" + db.falt.length, fecha, vend, prod: pr, cant: r, estado: "pendiente", t: Date.now() }); A[pr] = vd[pr] || 0; if (!A[pr]) delete A[pr]; db.mov.push({ t: Date.now(), rol: "inventario", quien: "Administrador", tipo: "inventario", inv: "", cliente: "", monto: 0, det: pr + ": a " + vend + " le faltan " + r + " unidades por devolver (cierre del " + fecha + ")" }); } });
      db.cierre[fecha + "|" + vend] = Date.now(); guardar(); avisar("cierre"); return json(res, 200, { faltantes: n });
    }
    if (u.pathname === "/api/faltantes" && req.method === "GET") return json(res, 200, db.falt);
    if (u.pathname === "/api/faltantes/recibir" && req.method === "POST") {
      const { id } = await leer(req), x = db.falt.find(z => z.id === id && z.estado === "pendiente"), p = x && db.inv.find(z => z.nombre === x.prod);
      if (!x) return json(res, 404, { error: "Faltante no encontrado" });
      x.estado = "recibido"; x.recibidoT = Date.now(); if (p) { const a = p.stock; p.stock += x.cant; movInv("Administrador", p.nombre, a, p.stock, "", "faltante devuelto por " + x.vend + " · " + x.fecha); }
      guardar(); avisar("inv"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/entregas" && req.method === "POST") {
      const { inv, paso } = await leer(req), c = db.cuentas.find(x => x.inv === inv && !x.anulada);
      if (!c || !["recoger", "entregar"].includes(paso)) return json(res, 400, { error: "Datos inválidos" });
      if (paso === "recoger" && c.entrega === "pendiente") { c.entrega = "recogido"; c.recogidoT = Date.now(); }
      else if (paso === "entregar" && c.entrega === "recogido") { c.entrega = "entregado"; c.entregaT = Date.now(); }
      else return json(res, 409, { error: paso === "entregar" ? "Primero confirma que recogiste el producto en la oficina." : "Esta entrega ya no está pendiente." });
      db.mov.push({ t: Date.now(), rol: "cobrador", quien: c.cob, tipo: "entrega", inv: c.inv, cliente: c.n, monto: 0, det: (paso === "recoger" ? "Recibió en la oficina: " : "Entregó al cliente: ") + c.prod });
      guardar(); avisar("entrega"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/cobradores" && req.method === "GET") return json(res, 200, db.cobs);
    if (u.pathname === "/api/jornadas" && req.method === "GET") return json(res, 200, Object.keys(db.jor).flatMap(f => Object.keys(db.jor[f]).map(cob => ({ fecha: f, cob, ini: db.jor[f][cob].ini || 0, fin: db.jor[f][cob].fin || 0 }))));
    if (u.pathname === "/api/prestamos" && req.method === "GET") return json(res, 200, db.prest);
    if (u.pathname === "/api/prestamos" && req.method === "POST") {
      const p = await leer(req), m = Math.floor(+p.monto || 0), f = /^\d{4}-\d{2}-\d{2}$/.test(p.fecha || "") ? p.fecha : new Date().toISOString().slice(0, 10);
      if (!db.cobs.includes(p.cob) || !(m > 0)) return json(res, 400, { error: "Elige un cobrador y un monto válido." });
      db.prest.push({ id: "PR" + (db.prest.length + 1), cob: p.cob, monto: m, fecha: f, t: Date.now(), abonos: [] }); guardar(); avisar("prest"); return json(res, 201, { ok: true });
    }
    if (u.pathname === "/api/prestamos/abono" && req.method === "POST") {
      const p = await leer(req), x = db.prest.find(z => z.id === p.id), m = Math.floor(+p.monto || 0), f = /^\d{4}-\d{2}-\d{2}$/.test(p.fecha || "") ? p.fecha : new Date().toISOString().slice(0, 10);
      if (!x) return json(res, 404, { error: "Préstamo no encontrado" });
      if (!(m > 0 && m <= x.monto - x.abonos.reduce((t, z) => t + z.m, 0))) return json(res, 400, { error: "El abono debe ser mayor a 0 y no superar el saldo." });
      x.abonos.push({ f, m, t: Date.now() }); guardar(); avisar("prest"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/mora/motivo" && req.method === "POST") {
      const p = await leer(req), c = db.cuentas.find(x => x.inv === p.inv && !x.anulada);
      if (!c) return json(res, 404, { error: "Cuenta no encontrada" });
      c.motivo = String(p.motivo || "").slice(0, 300); guardar(); avisar("mora"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/transferencia" && req.method === "POST") {
      const p = await leer(req), c = db.cuentas.find(x => x.inv === p.inv && !x.anulada), m = Math.floor(+p.monto || 0), num = String(p.num || "").replace(/[\s-]/g, "").toUpperCase();
      if (!c || c.tipo === "contado") return json(res, 404, { error: "Cuenta a crédito no encontrada" });
      const s = c.h.length ? c.h[c.h.length - 1].s : c.total;
      if (!(m > 0 && m <= s) || num.length < 4 || !p.foto) return json(res, 400, { error: "Revisa el valor (máximo el saldo: " + s + "), el número y la foto del comprobante." });
      const hash = crypto.createHash("sha256").update(p.foto).digest("hex"), dup = comp.lista.find(x => x.num === num || x.hash === hash);
      if (dup) return json(res, 409, { error: "Este comprobante ya fue registrado (factura " + dup.inv + ")." });
      const f = /^\d{4}-\d{2}-\d{2}$/.test(p.fecha || "") ? p.fecha : new Date().toISOString().slice(0, 10), ns = s - m, d = new Date(f + "T12:00:00"); d.setDate(d.getDate() + (c.dias || 7));
      comp.lista.push({ num, hash, foto: p.foto, inv: c.inv, cliente: c.n, cobrador: c.cob, monto: m, f, t: Date.now(), estado: "pendiente", oficina: true });
      c.h.push({ f, m, s: ns, p: ns ? d.toISOString().slice(0, 10) : "", metodo: "nequi", comp: num, oficina: true, t: Date.now() });
      db.mov.push({ t: Date.now(), rol: "administrador", quien: "Oficina", tipo: "cobro", inv: c.inv, cliente: c.n, monto: m, det: "La oficina recibió transferencia #" + num + " · " + (ns ? "quedan $" + ns.toLocaleString("es-CO") : "cuenta saldada") });
      guardar(); guardarComp(); avisar("cobro"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/clientes/mudanza" && req.method === "POST") {
      const p = await leer(req), c = db.cuentas.find(x => x.inv === p.inv && !x.anulada);
      if (!c) return json(res, 404, { error: "Cuenta no encontrada" });
      const antes = c.dir + ", " + c.c;
      db.cuentas.filter(x => x.n === c.n && x.tel === c.tel && !x.anulada).forEach(x => { if (p.dir != null) x.dir = String(p.dir).trim(); if (p.c != null) x.c = String(p.c).trim(); if (p.obs != null) x.obs = String(p.obs).trim(); if (p.foto) x.foto = p.foto; x.mud = (x.mud || []).concat({ t: Date.now(), antes, nota: String(p.nota || "") }); });
      db.mov.push({ t: Date.now(), rol: "administrador", quien: "Administrador", tipo: "mudanza", inv: c.inv, cliente: c.n, monto: 0, det: "Mudanza: de " + antes + " a " + c.dir + ", " + c.c + (p.nota ? " · " + p.nota : "") });
      guardar(); avisar("mudanza"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/comprobantes" && req.method === "GET") return json(res, 200, comp.lista.map(({ foto, hash, ...r }) => r));
    if (u.pathname === "/api/foto" && req.method === "GET") {
      const x = comp.lista.find(z => z.num === u.searchParams.get("num"));
      if (!x) { res.writeHead(404); return res.end("No encontrada"); }
      res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(Buffer.from(x.foto.split(",")[1], "base64"));
    }
    if (u.pathname === "/api/comprobantes/estado" && req.method === "POST") {
      const { num, estado } = await leer(req);
      const x = comp.lista.find(z => z.num === num);
      if (!x || !["verificado", "rechazado", "pendiente"].includes(estado)) return json(res, 400, { error: "Dato inválido" });
      x.estado = estado; guardarComp(); avisar("comp"); return json(res, 200, { ok: true });
    }
    if (u.pathname === "/api/cuentas" && req.method === "GET") {
      const cob = u.searchParams.get("cob");
      const vend = u.searchParams.get("vend");
      const l = db.cuentas.filter(c => (u.searchParams.get("adm") || !c.anulada) && (!cob || c.cob === cob) && (!vend || (c.vend || "Andrés Gómez") === vend));
      return json(res, 200, cob ? l.map(({ costo, ...r }) => r) : l.map(c => ({ ...c, costo: vend ? undefined : c.costo, foto: c.foto ? 1 : 0, h: c.h.map(({ sig, ...r }) => r) })));
    }
    if (u.pathname === "/api/ventas" && req.method === "POST") {
      const v = await leer(req);
      if (!v.n || !(v.prod || (v.items && v.items.length)) || !(v.total > 0) || (!v.contado && !v.cob) || (v.contado && !v.tel)) return json(res, 400, { error: "Datos incompletos" });
      const items = (Array.isArray(v.items) && v.items.length ? v.items : [v.prod]).map(String), cnt = {};
      items.forEach(n => cnt[n] = (cnt[n] || 0) + 1); const fa = {}, vendN = v.vend || "Andrés Gómez", de = v.de && v.de.comp && v.de.prod ? v.de : null;
      if (de && (de.comp === vendN || !cnt[de.prod] || rest(v.fecha || "", de.comp, de.prod) < 1)) return json(res, 409, { error: de.comp + " no tiene asignado ese producto." });
      for (const n of Object.keys(cnt)) {
        const p = db.inv.find(x => x.nombre === n);
        if (!p) return json(res, 409, { error: "El producto «" + n + "» no está en el inventario." });
        fa[n] = Math.min(rest(v.fecha || "", vendN, n) + (de && de.prod === n ? 1 : 0), cnt[n]); if (p.stock < cnt[n] - fa[n]) return json(res, 409, { error: "Solo quedan " + (p.stock + fa[n]) + " de " + p.nombre + "." });
      }
      const costo = items.reduce((t, n) => t + (db.inv.find(x => x.nombre === n).costo || 0), 0);
      const c = { inv: factura(db.siguiente++), n: v.n, tel: v.tel || "", ref: v.ref || "", dir: v.dir || "", c: v.c || "",
        obs: v.obs || "", prod: items.join(", "), items, total: v.total, dias: v.dias, cuota: v.cuota, first: v.first, cob: v.contado ? "" : v.cob, tipo: v.contado ? "contado" : "credito", vend: v.vend || "Andrés Gómez", fecha: v.fecha || "", foto: v.foto || "", costo, h: v.h || [], asig: Object.fromEntries(Object.entries(fa).filter(([, k]) => k > 0)) };
      Object.keys(cnt).forEach(n => { const p = db.inv.find(x => x.nombre === n), k = cnt[n] - (fa[n] || 0), a = p.stock; if (!k) return; p.stock -= k; movInv(c.vend, n, a, p.stock, c.inv, "venta");
        if (c.fecha) { const A = (db.asig[c.fecha] = db.asig[c.fecha] || {}), M = (A[c.vend] = A[c.vend] || {}); M[n] = (M[n] || 0) + k; c.asig[n] = (c.asig[n] || 0) + k; if (c.tipo === "credito") c.entrega = "pendiente"; db.mov.push({ t: Date.now(), rol: "vendedor", quien: c.vend, tipo: "inventario", inv: c.inv, cliente: c.n, monto: 0, det: n + ": vendido sin estar asignado · se agregó a las asignaciones del " + c.fecha + (c.entrega ? " · entrega pendiente por el cobrador" : "") }); }
      });
      if (de) { const A = db.asig[c.fecha], M = (A[c.vend] = A[c.vend] || {}); A[de.comp][de.prod]--; if (!A[de.comp][de.prod]) delete A[de.comp][de.prod]; if (!Object.keys(A[de.comp]).length) delete A[de.comp]; M[de.prod] = (M[de.prod] || 0) + 1; c.de = de; db.mov.push({ t: Date.now(), rol: "inventario", quien: c.vend, tipo: "inventario", inv: c.inv, cliente: c.n, monto: 0, det: de.prod + ": producto entregado a " + c.vend + " por su compañera " + de.comp }); }
      db.cuentas.push(c);
      const ini = c.h.find(r => r.ini), esC = c.tipo === "contado";
      db.mov.push({ t: Date.now(), rol: "vendedor", quien: c.vend, tipo: esC ? "contado" : "venta", inv: c.inv, cliente: c.n, monto: c.total,
        det: (esC ? "Venta de contado · " : "Venta a crédito · ") + c.prod + (esC ? "" : " · asignada a " + c.cob + (ini ? " · abono inicial $" + ini.m.toLocaleString("es-CO") : "")) });
      guardar(); avisar("venta");
      return json(res, 201, c);
    }
    if (u.pathname === "/api/cobros" && req.method === "POST") {
      const { inv, cobro, foto } = await leer(req);
      const c = db.cuentas.find(x => x.inv === inv && !x.anulada);
      if (!c || !cobro) return json(res, 404, { error: "Cuenta no encontrada" });
      const jj = (db.jor[cobro.f] || {})[c.cob] || {}, bb = (db.bloq[lunes(cobro.f || "")] || {})[c.cob] || {};
      if (jj.fin) return json(res, 409, { error: "El día de cobro ya fue finalizado." });
      if (bb.bi && !jj.ini) return json(res, 409, { error: "El administrador bloqueó el inicio del día de cobro." });
      cobro.t = Date.now();
      if (cobro.metodo === "nequi") {
        const num = String(cobro.comp || "").replace(/[\s-]/g, "").toUpperCase();
        if (num.length < 4 || !foto) return json(res, 400, { error: "Falta el número o la foto del comprobante." });
        const hash = crypto.createHash("sha256").update(foto).digest("hex");
        const dup = comp.lista.find(x => x.num === num || x.hash === hash);
        if (dup) return json(res, 409, { error: (dup.num === num ? "Este comprobante ya fue registrado" : "Esta foto ya se usó en otro cobro") + " (factura " + dup.inv + ")." });
        comp.lista.push({ num, hash, foto, inv, cliente: c.n, cobrador: c.cob, monto: cobro.m, f: cobro.f, t: Date.now(), estado: "pendiente" });
        cobro.comp = num; guardarComp();
      }
      c.h.push(cobro);
      db.mov.push({ t: Date.now(), rol: "cobrador", quien: c.cob, tipo: "cobro", inv: c.inv, cliente: c.n, monto: cobro.m,
        det: (cobro.metodo === "nequi" ? "Nequi #" + cobro.comp + " · " : "") + (cobro.s ? "Cobro · quedan $" + cobro.s.toLocaleString("es-CO") : "Cobro · cuenta saldada") });
      guardar(); avisar("cobro");
      return json(res, 200, c);
    }
    if (u.pathname === "/api/reset" && req.method === "POST") {
      db.cuentas.filter(c => !c.anulada).forEach(c => { const ta = { ...(c.asig || {}) }; (c.items || [c.prod]).forEach(n => { if (ta[n] > 0) { ta[n]--; return; } const p = db.inv.find(x => x.nombre === n); if (p) p.stock++; }); });
      Object.values(db.asig).forEach(d => Object.values(d).forEach(m => Object.keys(m).forEach(n => { const p = db.inv.find(x => x.nombre === n); if (p) p.stock += m[n]; })));
      db = { siguiente: 1, cuentas: [], mov: [], inv: db.inv, asig: {}, zonas: db.zonas, vends: db.vends, cobs: db.cobs, prest: [], jor: {}, bloq: {}, falt: [], cierre: {} }; guardar(); comp = { lista: [] }; guardarComp(); avisar("reset"); return json(res, 200, { ok: true });
    }
    // Archivos estáticos
    let f = u.pathname === "/" ? "/vendedor.html" : u.pathname;
    const p = path.normalize(path.join(PUB, f));
    if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end("No encontrado"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  } catch (e) { json(res, 500, { error: String(e.message || e) }); }
}).listen(PORT, () => {
  console.log(`Vendedor:      http://localhost:${PORT}/vendedor.html\nCobrador:      http://localhost:${PORT}/cobrador.html\nAdministrador: http://localhost:${PORT}/admin.html`);
  Object.values(require("os").networkInterfaces()).flat().filter(i => i.family === "IPv4" && !i.internal)
    .forEach(i => console.log(`Desde el celular (mismo Wi-Fi): http://${i.address}:${PORT}/vendedor.html`));
});
