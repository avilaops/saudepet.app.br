const geo = require('../../../src/services/geo.service');

describe('geo.service', () => {
  describe('distanciaKm', () => {
    it('mede a distância entre dois pontos conhecidos', () => {
      // Av. Paulista → Estádio do Morumbi, ~8 km em linha reta.
      const distancia = geo.distanciaKm(-23.5614, -46.6559, -23.6003, -46.7196);
      expect(distancia).toBeGreaterThan(6);
      expect(distancia).toBeLessThan(10);
    });

    it('devolve 0 para o mesmo ponto', () => {
      expect(geo.distanciaKm(-23.5, -46.6, -23.5, -46.6)).toBe(0);
    });

    it('devolve null quando falta qualquer coordenada', () => {
      expect(geo.distanciaKm(null, -46.6, -23.5, -46.6)).toBeNull();
      expect(geo.distanciaKm(-23.5, -46.6, undefined, -46.6)).toBeNull();
      expect(geo.distanciaKm(-23.5, -46.6, -23.5, NaN)).toBeNull();
    });

    it('funciona com strings numéricas vindas do banco', () => {
      expect(geo.distanciaKm('-23.5', '-46.6', '-23.5', '-46.6')).toBe(0);
    });
  });

  describe('ordenarPorDistancia', () => {
    it('coloca o mais perto primeiro e quem não tem coordenada por último', () => {
      const ordenado = geo.ordenarPorDistancia([
        { id: 'longe', distancia_km: 18 },
        { id: 'sem-gps', distancia_km: null },
        { id: 'perto', distancia_km: 1.2 }
      ]);

      expect(ordenado.map((item) => item.id)).toEqual(['perto', 'longe', 'sem-gps']);
    });

    it('não altera o array original', () => {
      const original = [{ distancia_km: 5 }, { distancia_km: 1 }];
      geo.ordenarPorDistancia(original);
      expect(original[0].distancia_km).toBe(5);
    });
  });

  describe('dentroDoRaio', () => {
    it('respeita o limite configurado', () => {
      expect(geo.dentroDoRaio(5, 20)).toBe(true);
      expect(geo.dentroDoRaio(20, 20)).toBe(true);
      expect(geo.dentroDoRaio(20.1, 20)).toBe(false);
    });

    it('aceita quem está sem coordenada — melhor um chamado a mais que nenhum', () => {
      expect(geo.dentroDoRaio(null, 20)).toBe(true);
    });
  });

  describe('rotuloDistancia', () => {
    it('usa metros abaixo de 1 km e vírgula decimal acima', () => {
      expect(geo.rotuloDistancia(0.85)).toBe('850 m');
      expect(geo.rotuloDistancia(3.24)).toBe('3,2 km');
      expect(geo.rotuloDistancia(null)).toBe('distância não informada');
    });
  });
});
