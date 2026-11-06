import assert from "node:assert/strict";
import test from "node:test";
import { irpf130Forecast, vatForecast } from "../src/tax/formulas.js";
test("IVA 4% y saldo a pagar",()=>assert.deepEqual(vatForecast(40,10),{repercutido:40,deducible:10,saldo:30}));
test("IVA varios tipos usa cuotas reales",()=>assert.deepEqual(vatForecast(104+21,20),{repercutido:125,deducible:20,saldo:105}));
test("IRPF 130 acumula ingresos y gastos y descuenta pagos",()=>assert.equal(irpf130Forecast({income:10000,expenses:4000,rate:20,previousPayments:500,withholdings:100,minoration:0,applicable:true}).result,600));
test("IRPF conserva saldo a compensar y respeta régimen no aplicable",()=>{assert.equal(irpf130Forecast({income:1000,expenses:2000,rate:20,previousPayments:0,withholdings:0,minoration:0,applicable:true}).result,-200);assert.equal(irpf130Forecast({income:1000,expenses:0,rate:20,previousPayments:0,withholdings:0,minoration:0,applicable:false}).result,0)});
