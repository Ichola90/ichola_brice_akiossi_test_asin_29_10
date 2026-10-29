import { describe, it, expect } from "vitest";
import {
  parserDateHeureBenin,
  estWeekend,
  estCreneauGrilleValide,
  differenceMinutes,
} from "../src/temps.js";

describe("src/temps.ts - Gestion du temps béninois (UTC+1)", () => {
  describe("parserDateHeureBenin - mode strict (prise de rendez-vous)", () => {
    it("parse un format valide AAAA-MM-JJTHH:MM", () => {
      const parsed = parserDateHeureBenin("2026-11-16T08:30", true);
      expect(parsed).not.toBeNull();
      expect(parsed?.annee).toBe(2026);
      expect(parsed?.mois).toBe(11);
      expect(parsed?.jour).toBe(16);
      expect(parsed?.heures).toBe(8);
      expect(parsed?.minutes).toBe(30);
      expect(parsed?.secondes).toBe(0);
      expect(parsed?.jourSemaine).toBe(1); // Lundi
      expect(parsed?.chaineIso).toBe("2026-11-16T08:30");
    });

    it("rejette les formats avec secondes ou espace en mode strict", () => {
      expect(parserDateHeureBenin("2026-11-16T08:30:00", true)).toBeNull();
      expect(parserDateHeureBenin("2026-11-16 08:30", true)).toBeNull();
    });

    it("rejette les dates inexistantes (ex: 2026-02-30)", () => {
      expect(parserDateHeureBenin("2026-02-30T10:00", true)).toBeNull();
      expect(parserDateHeureBenin("2026-04-31T10:00", true)).toBeNull();
      expect(parserDateHeureBenin("2026-13-01T10:00", true)).toBeNull();
    });

    it("rejette les types non-string", () => {
      expect(parserDateHeureBenin(123456, true)).toBeNull();
      expect(parserDateHeureBenin(null, true)).toBeNull();
      expect(parserDateHeureBenin(undefined, true)).toBeNull();
      expect(parserDateHeureBenin({}, true)).toBeNull();
    });
  });

  describe("parserDateHeureBenin - mode tolérant (now et base existante)", () => {
    it("parse les dates de l'export SQL avec espaces et secondes", () => {
      const parsed = parserDateHeureBenin("2026-11-20 18:00:00", false);
      expect(parsed).not.toBeNull();
      expect(parsed?.annee).toBe(2026);
      expect(parsed?.mois).toBe(11);
      expect(parsed?.jour).toBe(20);
      expect(parsed?.heures).toBe(18);
      expect(parsed?.minutes).toBe(0);
      expect(parsed?.secondes).toBe(0);
      expect(parsed?.jourSemaine).toBe(5); // Vendredi
    });

    it("convertit un objet Date UTC en heure civile béninoise (+1 h)", () => {
      // 10:00:00 UTC = 11:00:00 WAT (Bénin)
      const dateUtc = new Date(Date.UTC(2026, 10, 20, 10, 0, 0));
      const parsed = parserDateHeureBenin(dateUtc, false);
      expect(parsed).not.toBeNull();
      expect(parsed?.heures).toBe(11);
      expect(parsed?.minutes).toBe(0);
    });
  });

  describe("estWeekend", () => {
    it("détecte correctement le samedi et le dimanche", () => {
      const samedi = parserDateHeureBenin("2026-11-14T10:00", true)!;
      const dimanche = parserDateHeureBenin("2026-11-15T10:00", true)!;
      const lundi = parserDateHeureBenin("2026-11-16T10:00", true)!;
      const vendredi = parserDateHeureBenin("2026-11-20T10:00", true)!;

      expect(estWeekend(samedi)).toBe(true);
      expect(estWeekend(dimanche)).toBe(true);
      expect(estWeekend(lundi)).toBe(false);
      expect(estWeekend(vendredi)).toBe(false);
    });
  });

  describe("estCreneauGrilleValide", () => {
    it("accepte 08:00 (début de grille) et 15:30 (fin de grille)", () => {
      const debut = parserDateHeureBenin("2026-11-16T08:00", true)!;
      const fin = parserDateHeureBenin("2026-11-16T15:30", true)!;
      const milieu = parserDateHeureBenin("2026-11-16T11:30", true)!;

      expect(estCreneauGrilleValide(debut)).toBe(true);
      expect(estCreneauGrilleValide(fin)).toBe(true);
      expect(estCreneauGrilleValide(milieu)).toBe(true);
    });

    it("refuse avant 08:00 (ex: 07:30) et après 15:30 (ex: 15:45, 16:00)", () => {
      const tropTot = parserDateHeureBenin("2026-11-16T07:30", true)!;
      const entreDeux = parserDateHeureBenin("2026-11-16T15:45", true)!;
      const tropTard = parserDateHeureBenin("2026-11-16T16:00", true)!;

      expect(estCreneauGrilleValide(tropTot)).toBe(false);
      expect(estCreneauGrilleValide(entreDeux)).toBe(false);
      expect(estCreneauGrilleValide(tropTard)).toBe(false);
    });

    it("refuse les minutes non alignées sur 30 min (ex: 09:15, 10:45)", () => {
      const invalide15 = parserDateHeureBenin("2026-11-16T09:15", true)!;
      expect(estCreneauGrilleValide(invalide15)).toBe(false);
    });
  });

  describe("differenceMinutes", () => {
    it("calcule précisément le délai en minutes entre deux dates", () => {
      const d1 = parserDateHeureBenin("2026-11-17T18:00", true)!;
      const d2 = parserDateHeureBenin("2026-11-19T10:00", true)!;
      // Du 17 à 18h au 19 à 10h = 24h + 16h = 40 heures = 2400 minutes
      expect(differenceMinutes(d2, d1)).toBe(2400);

      // 24 h pile = 1440 minutes
      const rdv24h = parserDateHeureBenin("2026-11-18T18:00", true)!;
      expect(differenceMinutes(rdv24h, d1)).toBe(1440);

      // 23 h 59 = 1439 minutes
      const rdv23h59 = parserDateHeureBenin("2026-11-18T17:59", true)!;
      expect(differenceMinutes(rdv23h59, d1)).toBe(1439);
    });
  });
});
