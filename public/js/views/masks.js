/* PlantãoPro — Máscaras BR para inputs do formulário (R$, data DD/MM/AAAA, hora HH:MM) */
(function (global) {
  'use strict';
  function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }
  function mascaraBRL(input) {
    input.addEventListener('input', () => {
      let d = onlyDigits(input.value).slice(0, 12);
      let n = (parseInt(d || '0', 10) / 100).toFixed(2);
      // R$ 1.234,56
      const [intPart, dec] = n.split('.');
      const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      input.value = 'R$ ' + intFmt + ',' + dec;
    });
  }
  function brToCentavos(s) {
    const d = onlyDigits(s);
    return d ? parseInt(d, 10) : 0; // input salva como centavos (sem divisão por 100). Compatível com Number() em reais sem escala.
  }
  function mascaraData(input) {
    input.addEventListener('input', () => {
      let d = onlyDigits(input.value).slice(0, 8);
      if (d.length > 4) d = d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
      else if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2);
      input.value = d;
    });
  }
  function dataParaISO(s) {
    const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const dd = +m[1], mm = +m[2], yyyy = +m[3];
    const d = new Date(yyyy, mm - 1, dd);
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
    return yyyy + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
  }
  function mascaraHora(input) {
    input.addEventListener('input', () => {
      let d = onlyDigits(input.value).slice(0, 4);
      if (d.length > 2) d = d.slice(0, 2) + ':' + d.slice(2);
      input.value = d;
    });
  }
  function horaValida(s) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
  }
  global.Masks = { mascaraBRL, brToCentavos, mascaraData, dataParaISO, mascaraHora, horaValida };
})(typeof window !== 'undefined' ? window : globalThis);
