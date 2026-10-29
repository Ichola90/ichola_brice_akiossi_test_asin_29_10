import { describe, it, expect } from "vitest";
import {
  verifierPriseRendezVous,
  verifierAnnulation,
  verifierChangementStatut,
  listerRendezVousUsager,
} from "../src/regles.js";
import { MESSAGES, RendezVous } from "../src/types.js";

describe("Suite de tests d'acceptation - Recrutement ASIN (Bénin)", () => {
  // Horodatage de l'export SQL officiel : Vendredi 20 novembre 2026 à 18h00 (Bénin, UTC+1)
  const NOW_EXPORT = "2026-11-20T18:00:00";

  // =========================================================================
  // REJOUEMENT DES TICKETS TMA (TMA-101 à TMA-107)
  // =========================================================================

  describe("TMA-101 : Rejet d'un créneau le week-end (samedi 14 novembre 2026)", () => {
    it("TMA-101 : refuse la prise de rendez-vous un samedi avec code 409", () => {
      // Rejeu du cas réel : NPI 0614253647, PASSEPORT, 2026-11-14T10:00 (Samedi)
      const now = "2026-11-09T08:00";
      const res = verifierPriseRendezVous(
        {
          npi: "0614253647",
          service: "PASSEPORT",
          dateHeure: "2026-11-14T10:00",
        },
        [],
        now
      );

      expect(res).toEqual({
        ok: false,
        status: 409,
        message: MESSAGES.FERME_WEEKEND,
      });
    });
  });

  describe("TMA-102 : Capacité maximale de 3 usagers par créneau (2026-11-10T09:00)", () => {
    // Les 3 rendez-vous déjà enregistrés dans l'export sur ce créneau
    const rendezVousCreneau: RendezVous[] = [
      {
        id: 632,
        npi: "0638958971",
        service: "PASSEPORT",
        dateHeure: "2026-11-10 09:00:00",
        statut: "honore",
      },
      {
        id: 644,
        npi: "0671968463",
        service: "CNI",
        dateHeure: "2026-11-10 09:00:00",
        statut: "honore",
      },
      {
        id: 681,
        npi: "0609394161",
        service: "PERMIS",
        dateHeure: "2026-11-10 09:00:00",
        statut: "honore",
      },
    ];

    it("TMA-102 : refuse le 4e rendez-vous (n° 697) avec code 409 'Ce créneau est complet.'", () => {
      const now = "2026-11-04T20:00";
      const res = verifierPriseRendezVous(
        {
          npi: "0620214467", // Usager du n° 697
          service: "PERMIS",
          dateHeure: "2026-11-10T09:00",
        },
        rendezVousCreneau,
        now
      );

      expect(res).toEqual({
        ok: false,
        status: 409,
        message: MESSAGES.CRENEAU_COMPLET,
      });
    });

    it("TMA-102 : accepte l'inscription si l'un des 3 rendez-vous existants a été annulé", () => {
      const now = "2026-11-04T20:00";
      const avecUnAnnule: RendezVous[] = [
        rendezVousCreneau[0]!,
        { ...rendezVousCreneau[1]!, statut: "annule" },
        rendezVousCreneau[2]!,
      ];

      const res = verifierPriseRendezVous(
        {
          npi: "0620214467",
          service: "PERMIS",
          dateHeure: "2026-11-10T09:00",
        },
        avecUnAnnule,
        now
      );

      expect(res).toEqual({ ok: true });
    });
  });

  describe("TMA-103 : Validation robuste du NPI (rejet 400 sans erreur interne)", () => {
    const now = "2026-11-20T18:00";

    it("TMA-103 : rejette NPI '06142A3647' avec code 400 sans exception", () => {
      const res = verifierPriseRendezVous(
        {
          npi: "06142A3647",
          service: "CNI",
          dateHeure: "2026-11-23T08:30",
        },
        [],
        now
      );

      expect(res).toEqual({
        ok: false,
        status: 400,
        message: MESSAGES.NPI_INVALIDE,
      });
    });

    it("TMA-103 : rejette les variantes invalides de NPI (longueur, format, type)", () => {
      const dateHeure = "2026-11-23T08:30";

      // 9 chiffres
      expect(verifierPriseRendezVous({ npi: "012345678", service: "CNI", dateHeure }, [], now))
        .toEqual({ ok: false, status: 400, message: MESSAGES.NPI_INVALIDE });

      // 11 chiffres
      expect(verifierPriseRendezVous({ npi: "01234567890", service: "CNI", dateHeure }, [], now))
        .toEqual({ ok: false, status: 400, message: MESSAGES.NPI_INVALIDE });

      // Chaîne vide
      expect(verifierPriseRendezVous({ npi: "", service: "CNI", dateHeure }, [], now))
        .toEqual({ ok: false, status: 400, message: MESSAGES.NPI_INVALIDE });

      // Chaîne avec espaces
      expect(verifierPriseRendezVous({ npi: " 0102030405 ", service: "CNI", dateHeure }, [], now))
        .toEqual({ ok: false, status: 400, message: MESSAGES.NPI_INVALIDE });

      // Nombre au lieu de chaîne (type incorrect)
      expect(verifierPriseRendezVous({ npi: 614253647 as any, service: "CNI", dateHeure }, [], now))
        .toEqual({ ok: false, status: 400, message: MESSAGES.NPI_INVALIDE });

      // Null ou undefined
      expect(verifierPriseRendezVous({ npi: null as any, service: "CNI", dateHeure }, [], now))
        .toEqual({ ok: false, status: 400, message: MESSAGES.NPI_INVALIDE });
    });
  });

  describe("TMA-104 : Délai d'annulation de 24 h (rendez-vous 709)", () => {
    // Rendez-vous 709 de l'export : prévu le 2026-11-19 à 10:00
    const rdv709: RendezVous = {
      id: 709,
      npi: "0339205992",
      service: "PERMIS",
      dateHeure: "2026-11-19 10:00:00",
      statut: "confirme",
    };

    it("TMA-104 : accepte l'annulation demandée le 2026-11-17 à 18:00 (40 h d'avance)", () => {
      const nowDemande = "2026-11-17T18:00";
      const res = verifierAnnulation(rdv709, nowDemande);
      expect(res).toEqual({ ok: true });
    });

    it("TMA-104 : accepte l'annulation demandée exactement 24 h pile avant le créneau", () => {
      // 24 h pile avant le 19/11 à 10:00 = 18/11 à 10:00
      const now24h = "2026-11-18T10:00";
      const res = verifierAnnulation(rdv709, now24h);
      expect(res).toEqual({ ok: true });
    });

    it("TMA-104 : refuse l'annulation demandée 23 h 59 avant le créneau (moins de 24 h)", () => {
      // 23 h 59 avant le 19/11 à 10:00 = 18/11 à 10:01
      const now23h59 = "2026-11-18T10:01";
      const res = verifierAnnulation(rdv709, now23h59);
      expect(res).toEqual({
        ok: false,
        status: 409,
        message: MESSAGES.ANNULATION_TARDIVE,
      });
    });
  });

  describe("TMA-105 : Protection des statuts définitifs (rendez-vous 292)", () => {
    // Rendez-vous 292 de l'export (NPI 0330677555), statut annule
    const rdv292: RendezVous = {
      id: 292,
      npi: "0330677555",
      service: "PASSEPORT",
      dateHeure: "2026-11-12 10:00:00",
      statut: "annule",
    };

    it("TMA-105 : refuse le changement de statut vers 'honore' d'un rendez-vous annulé", () => {
      const res = verifierChangementStatut(rdv292, "honore");
      expect(res).toEqual({
        ok: false,
        status: 409,
        message: MESSAGES.DEJA_CLOTURE,
      });
    });

    it("TMA-105 : refuse également de modifier un rendez-vous déjà au statut 'honore' ou 'absent'", () => {
      const rdvHonore: RendezVous = { ...rdv292, statut: "honore" };
      expect(verifierChangementStatut(rdvHonore, "absent")).toEqual({
        ok: false,
        status: 409,
        message: MESSAGES.DEJA_CLOTURE,
      });

      const rdvAbsent: RendezVous = { ...rdv292, statut: "absent" };
      expect(verifierChangementStatut(rdvAbsent, "honore")).toEqual({
        ok: false,
        status: 409,
        message: MESSAGES.DEJA_CLOTURE,
      });
    });
  });

  describe("TMA-106 : Tri et pagination des 13 rendez-vous de l'usager 0203040506", () => {
    // Les 13 rendez-vous exacts de base_rendez_vous.sql
    const rendezVousUsager0203040506: RendezVous[] = [
      { id: 1, npi: "0203040506", service: "PASSEPORT", dateHeure: "2026-01-05 08:30:00", statut: "honore" },
      { id: 2, npi: "0203040506", service: "CNI", dateHeure: "2026-02-12 10:00:00", statut: "honore" },
      { id: 3, npi: "0203040506", service: "PERMIS", dateHeure: "2026-03-03 14:30:00", statut: "absent" },
      { id: 4, npi: "0203040506", service: "PASSEPORT", dateHeure: "2026-04-21 09:00:00", statut: "honore" },
      { id: 5, npi: "0203040506", service: "CNI", dateHeure: "2026-05-08 11:30:00", statut: "honore" },
      { id: 6, npi: "0203040506", service: "PERMIS", dateHeure: "2026-05-19 15:00:00", statut: "absent" },
      { id: 7, npi: "0203040506", service: "PASSEPORT", dateHeure: "2026-06-02 08:00:00", statut: "honore" },
      { id: 8, npi: "0203040506", service: "CNI", dateHeure: "2026-06-16 13:30:00", statut: "honore" },
      { id: 9, npi: "0203040506", service: "PERMIS", dateHeure: "2026-07-07 10:30:00", statut: "honore" },
      { id: 10, npi: "0203040506", service: "PASSEPORT", dateHeure: "2026-07-28 09:30:00", statut: "absent" },
      { id: 11, npi: "0203040506", service: "CNI", dateHeure: "2026-08-11 14:00:00", statut: "honore" },
      { id: 259, npi: "0203040506", service: "PERMIS", dateHeure: "2026-09-25 11:00:00", statut: "honore" },
      { id: 826, npi: "0203040506", service: "PASSEPORT", dateHeure: "2026-12-02 08:30:00", statut: "confirme" },
    ];

    it("TMA-106 : le premier est le 826, les dates suivent l'ordre décroissant, total 13, page 2 = 3 éléments", () => {
      // Page 1
      const p1 = listerRendezVousUsager(rendezVousUsager0203040506, "0203040506", NOW_EXPORT, 1, 10);
      expect(p1.total).toBe(13);
      expect(p1.totalPages).toBe(2);
      expect(p1.rendezVous).toHaveLength(10);
      expect(p1.rendezVous[0]?.id).toBe(826);

      // Vérification de l'ordre décroissant strict des suivants
      const idsPage1 = p1.rendezVous.map((r) => r.id);
      expect(idsPage1).toEqual([826, 259, 11, 10, 9, 8, 7, 6, 5, 4]);

      // Page 2
      const p2 = listerRendezVousUsager(rendezVousUsager0203040506, "0203040506", NOW_EXPORT, 2, 10);
      expect(p2.rendezVous).toHaveLength(3);
      const idsPage2 = p2.rendezVous.map((r) => r.id);
      expect(idsPage2).toEqual([3, 2, 1]);
    });
  });

  describe("TMA-107 : Un seul rendez-vous à venir (cas conforme et piège)", () => {
    // Usager 0102030405 a le rendez-vous 800 (PASSEPORT, 2026-11-26 10:00, confirme)
    const rendezVous800: RendezVous = {
      id: 800,
      npi: "0102030405",
      service: "PASSEPORT",
      dateHeure: "2026-11-26 10:00:00",
      statut: "confirme",
    };

    it("TMA-107 (CONFORME) : maintient le refus 409 'Vous avez déjà un rendez-vous à venir.' pour PERMIS le 27/11", () => {
      const res = verifierPriseRendezVous(
        {
          npi: "0102030405",
          service: "PERMIS",
          dateHeure: "2026-11-27T09:00",
        },
        [rendezVous800],
        NOW_EXPORT
      );

      expect(res).toEqual({
        ok: false,
        status: 409,
        message: MESSAGES.DEJA_A_VENIR,
      });
    });

    it("TMA-107 : un rendez-vous confirmé mais DÉJÀ PASSÉ ne bloque pas la nouvelle prise", () => {
      const rendezVousPasse: RendezVous = {
        id: 790,
        npi: "0102030405",
        service: "PASSEPORT",
        dateHeure: "2026-11-15 10:00:00", // Antérieur à NOW_EXPORT (20/11)
        statut: "confirme",
      };

      const res = verifierPriseRendezVous(
        {
          npi: "0102030405",
          service: "PERMIS",
          dateHeure: "2026-11-27T09:00",
        },
        [rendezVousPasse],
        NOW_EXPORT
      );

      expect(res).toEqual({ ok: true });
    });
  });

  // =========================================================================
  // TESTS DE BORNES EXHAUSTIFS
  // =========================================================================

  describe("Tests de bornes : Horaires de la grille", () => {
    const npi = "0555555555";
    const service = "PASSEPORT";
    const now = "2026-11-20T18:00";

    it("créneau 08:00 (début de grille) : accepté", () => {
      const res = verifierPriseRendezVous({ npi, service, dateHeure: "2026-11-23T08:00" }, [], now);
      expect(res).toEqual({ ok: true });
    });

    it("créneau 07:30 (avant la grille) : refusé 409", () => {
      const res = verifierPriseRendezVous({ npi, service, dateHeure: "2026-11-23T07:30" }, [], now);
      expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.HORS_GRILLE });
    });

    it("créneau 15:30 (dernier créneau autorisé) : accepté", () => {
      const res = verifierPriseRendezVous({ npi, service, dateHeure: "2026-11-23T15:30" }, [], now);
      expect(res).toEqual({ ok: true });
    });

    it("créneau 15:45 (après 15:30 et non multiple de 30 min) : refusé 409", () => {
      const res = verifierPriseRendezVous({ npi, service, dateHeure: "2026-11-23T15:45" }, [], now);
      expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.HORS_GRILLE });
    });

    it("créneau 16:00 (après la grille) : refusé 409", () => {
      const res = verifierPriseRendezVous({ npi, service, dateHeure: "2026-11-23T16:00" }, [], now);
      expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.HORS_GRILLE });
    });
  });

  describe("Tests de bornes : Jours d'ouverture", () => {
    const npi = "0555555555";
    const service = "CNI";
    const now = "2026-11-20T18:00";

    it("vendredi (jour ouvré valide) : accepté", () => {
      // Vendredi 27 novembre 2026
      const res = verifierPriseRendezVous({ npi, service, dateHeure: "2026-11-27T10:00" }, [], now);
      expect(res).toEqual({ ok: true });
    });

    it("samedi (fermé) : refusé 409", () => {
      // Samedi 28 novembre 2026
      const res = verifierPriseRendezVous({ npi, service, dateHeure: "2026-11-28T10:00" }, [], now);
      expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.FERME_WEEKEND });
    });

    it("dimanche (fermé) : refusé 409", () => {
      // Dimanche 29 novembre 2026
      const res = verifierPriseRendezVous({ npi, service, dateHeure: "2026-11-29T10:00" }, [], now);
      expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.FERME_WEEKEND });
    });
  });

  describe("Tests de bornes : Capacité du créneau", () => {
    const dateHeure = "2026-11-25T11:00";
    const now = "2026-11-20T18:00";

    it("3e inscrit : accepté, 4e inscrit : refusé 409", () => {
      const deuxInscrits: RendezVous[] = [
        { id: 101, npi: "1000000001", service: "PASSEPORT", dateHeure, statut: "confirme" },
        { id: 102, npi: "1000000002", service: "CNI", dateHeure, statut: "confirme" },
      ];

      // 3e inscrit
      const res3 = verifierPriseRendezVous(
        { npi: "1000000003", service: "PERMIS", dateHeure },
        deuxInscrits,
        now
      );
      expect(res3).toEqual({ ok: true });

      // 4e inscrit
      const troisInscrits: RendezVous[] = [
        ...deuxInscrits,
        { id: 103, npi: "1000000003", service: "PERMIS", dateHeure, statut: "confirme" },
      ];
      const res4 = verifierPriseRendezVous(
        { npi: "1000000004", service: "PASSEPORT", dateHeure },
        troisInscrits,
        now
      );
      expect(res4).toEqual({ ok: false, status: 409, message: MESSAGES.CRENEAU_COMPLET });
    });

    it("un rendez-vous annulé libère la place", () => {
      const troisDontUnAnnule: RendezVous[] = [
        { id: 101, npi: "1000000001", service: "PASSEPORT", dateHeure, statut: "confirme" },
        { id: 102, npi: "1000000002", service: "CNI", dateHeure, statut: "annule" },
        { id: 103, npi: "1000000003", service: "PERMIS", dateHeure, statut: "confirme" },
      ];

      const res = verifierPriseRendezVous(
        { npi: "1000000004", service: "PERMIS", dateHeure },
        troisDontUnAnnule,
        now
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe("Tests de bornes : Validité et synchronisation temporelle", () => {
    const npi = "0777777777";
    const service = "PERMIS";

    it("date calendrier inexistante (ex: 2026-02-30) : refusé 400", () => {
      const res = verifierPriseRendezVous(
        { npi, service, dateHeure: "2026-02-30T10:00" },
        [],
        "2026-01-01T08:00"
      );
      expect(res).toEqual({ ok: false, status: 400, message: MESSAGES.DATE_INVALIDE });
    });

    it("dateHeure sans le séparateur 'T' (ex: avec espace) : refusé 400", () => {
      const res = verifierPriseRendezVous(
        { npi, service, dateHeure: "2026-11-23 10:00" },
        [],
        "2026-11-20T18:00"
      );
      expect(res).toEqual({ ok: false, status: 400, message: MESSAGES.DATE_INVALIDE });
    });

    it("date passée (< now) : refusé 409", () => {
      const res = verifierPriseRendezVous(
        { npi, service, dateHeure: "2026-11-20T08:00" },
        [],
        "2026-11-20T18:00"
      );
      expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.DATE_PASSEE });
    });

    it("now exactement égal au créneau demandé : accepté", () => {
      const res = verifierPriseRendezVous(
        { npi, service, dateHeure: "2026-11-23T08:30" },
        [],
        "2026-11-23T08:30"
      );
      expect(res).toEqual({ ok: true });
    });
  });
});
