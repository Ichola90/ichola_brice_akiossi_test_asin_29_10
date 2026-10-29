import { describe, it, expect } from "vitest";
import {
  verifierPriseRendezVous,
  verifierAnnulation,
  verifierChangementStatut,
  listerRendezVousUsager,
} from "../src/regles.js";
import { MESSAGES, RendezVous } from "../src/types.js";

describe("ÉTAPE 3 : Audit strict des messages au caractère près", () => {
  const LISTE_ATTENDUE = [
    { code: 400, message: "Le NPI doit comporter exactement 10 chiffres." },
    { code: 400, message: "Service inconnu : choisissez PASSEPORT, CNI ou PERMIS." },
    { code: 400, message: "Date et heure invalides (format attendu : AAAA-MM-JJTHH:MM)." },
    { code: 409, message: "Impossible de prendre un rendez-vous dans le passé." },
    { code: 409, message: "Le centre est fermé le week-end." },
    { code: 409, message: "Créneau invalide : de 08:00 à 15:30, toutes les 30 minutes." },
    { code: 409, message: "Vous avez déjà un rendez-vous à venir." },
    { code: 409, message: "Ce créneau est complet." },
    { code: 409, message: "Ce rendez-vous ne peut plus être annulé." },
    { code: 409, message: "Annulation impossible moins de 24 h avant le rendez-vous." },
    { code: 400, message: "Statut invalide : honore ou absent." },
    { code: 409, message: "Ce rendez-vous est déjà clôturé." },
  ];

  it("vérifie que chaque message de MESSAGES est exactement conforme au caractère près", () => {
    const messagesDuModule = [
      { code: 400, message: MESSAGES.NPI_INVALIDE },
      { code: 400, message: MESSAGES.SERVICE_INCONNU },
      { code: 400, message: MESSAGES.DATE_INVALIDE },
      { code: 409, message: MESSAGES.DATE_PASSEE },
      { code: 409, message: MESSAGES.FERME_WEEKEND },
      { code: 409, message: MESSAGES.HORS_GRILLE },
      { code: 409, message: MESSAGES.DEJA_A_VENIR },
      { code: 409, message: MESSAGES.CRENEAU_COMPLET },
      { code: 409, message: MESSAGES.ANNULATION_NON_CONFIRME },
      { code: 409, message: MESSAGES.ANNULATION_TARDIVE },
      { code: 400, message: MESSAGES.STATUT_INCONNU },
      { code: 409, message: MESSAGES.DEJA_CLOTURE },
    ];

    expect(messagesDuModule).toHaveLength(LISTE_ATTENDUE.length);

    for (let i = 0; i < LISTE_ATTENDUE.length; i++) {
      const attendu = LISTE_ATTENDUE[i]!;
      const reel = messagesDuModule[i]!;
      expect(reel.code).toBe(attendu.code);
      expect(reel.message).toBe(attendu.message);
      // Comparaison caractère par caractère
      expect(reel.message.length).toBe(attendu.message.length);
      for (let j = 0; j < attendu.message.length; j++) {
        expect(reel.message[j]).toBe(attendu.message[j]);
      }
    }
  });
});

describe("ÉTAPE 4 : Audit approfondi des règles et cas limites", () => {
  const now = "2026-11-20T18:00:00"; // Vendredi 20 novembre 2026 à 18h00

  describe("Prise de rendez-vous : Contrôle NPI exhaustif", () => {
    const baseValide = { service: "PASSEPORT", dateHeure: "2026-11-23T09:00" };

    it("accepte '0614253647'", () => {
      const res = verifierPriseRendezVous({ npi: "0614253647", ...baseValide }, [], now);
      expect(res).toEqual({ ok: true });
    });

    const npisInvalides = [
      { cas: "9 chiffres", val: "123456789" },
      { cas: "11 chiffres", val: "12345678901" },
      { cas: "lettre dans NPI", val: "06142A3647" },
      { cas: "chaîne vide", val: "" },
      { cas: "espace début", val: " 0614253647" },
      { cas: "saut de ligne", val: "0614253647\n" },
      { cas: "nombre (non string)", val: 614253647 },
      { cas: "null", val: null },
      { cas: "undefined", val: undefined },
      { cas: "objet", val: {} },
    ];

    it.each(npisInvalides)("refuse en 400 sans crash : $cas", ({ val }) => {
      const res = verifierPriseRendezVous({ npi: val, ...baseValide }, [], now);
      expect(res).toEqual({ ok: false, status: 400, message: MESSAGES.NPI_INVALIDE });
    });
  });

  describe("Prise de rendez-vous : Contrôle Service", () => {
    const baseValide = { npi: "0102030405", dateHeure: "2026-11-23T09:00" };

    it("accepte PASSEPORT, CNI, PERMIS", () => {
      expect(verifierPriseRendezVous({ service: "PASSEPORT", ...baseValide }, [], now)).toEqual({ ok: true });
      expect(verifierPriseRendezVous({ service: "CNI", ...baseValide }, [], now)).toEqual({ ok: true });
      expect(verifierPriseRendezVous({ service: "PERMIS", ...baseValide }, [], now)).toEqual({ ok: true });
    });

    const servicesInvalides = [
      "passeport", "Cni", "", null, undefined, "VISA", "CARTE_GRISE", 123
    ];

    it.each(servicesInvalides)("refuse en 400 le service invalide : %s", (service) => {
      const res = verifierPriseRendezVous({ service, ...baseValide }, [], now);
      expect(res).toEqual({ ok: false, status: 400, message: MESSAGES.SERVICE_INCONNU });
    });
  });

  describe("Prise de rendez-vous : Contrôle Format Date", () => {
    const baseValide = { npi: "0102030405", service: "CNI" };

    it("accepte '2026-11-23T09:00'", () => {
      expect(verifierPriseRendezVous({ dateHeure: "2026-11-23T09:00", ...baseValide }, [], now)).toEqual({ ok: true });
    });

    const datesInvalides = [
      "2026-11-23 09:00", // Espace au lieu de T
      "2026-11-23T09:00:00", // Secondes présentes
      "23/11/2026 09:00", // Format français
      "2026-02-30T09:00", // Février 30
      "2026-13-01T09:00", // Mois 13
      "2026-11-23T25:00", // Heure 25
      "2026-11-23T09:60", // Minute 60
      "",
      null,
      undefined,
      123456789,
    ];

    it.each(datesInvalides)("refuse en 400 la date invalide : %s", (dateHeure) => {
      const res = verifierPriseRendezVous({ dateHeure, ...baseValide }, [], now);
      expect(res).toEqual({ ok: false, status: 400, message: MESSAGES.DATE_INVALIDE });
    });
  });

  describe("Prise de rendez-vous : Ordre de priorité passé vs week-end", () => {
    it("renvoie 'dans le passé' (409) avant 'fermé le week-end' pour un samedi passé", () => {
      // Samedi 14 novembre 2026 à 10:00 (est à la fois dans le passé par rapport au 20/11 et un samedi)
      const res = verifierPriseRendezVous(
        { npi: "0102030405", service: "CNI", dateHeure: "2026-11-14T10:00" },
        [],
        now
      );
      // Règle 4 (date passée) doit primer sur Règle 5 (week-end)
      expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.DATE_PASSEE });
    });
  });

  describe("Prise de rendez-vous : Week-end vs Jours ouvrés", () => {
    it("accepte le vendredi 2026-11-20 (à 18:00 pile pour tester now)", () => {
      const res = verifierPriseRendezVous(
        { npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-20T18:00" },
        [],
        "2026-11-20T18:00"
      );
      // 18:00 est hors grille, donc doit échouer sur grille mais PAS sur week-end
      expect(res.message).toBe(MESSAGES.HORS_GRILLE);
    });

    it("accepte le vendredi ouvré dans la grille et le lundi ouvré", () => {
      // Vendredi 27 novembre 2026 à 09:00
      expect(verifierPriseRendezVous(
        { npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-27T09:00" },
        [],
        now
      )).toEqual({ ok: true });

      // Lundi 23 novembre 2026 à 09:00
      expect(verifierPriseRendezVous(
        { npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-23T09:00" },
        [],
        now
      )).toEqual({ ok: true });
    });

    it("refuse le samedi 2026-11-21 et le dimanche 2026-11-22 en 409", () => {
      expect(verifierPriseRendezVous(
        { npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-21T09:00" },
        [],
        now
      )).toEqual({ ok: false, status: 409, message: MESSAGES.FERME_WEEKEND });

      expect(verifierPriseRendezVous(
        { npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-22T09:00" },
        [],
        now
      )).toEqual({ ok: false, status: 409, message: MESSAGES.FERME_WEEKEND });
    });
  });

  describe("Prise de rendez-vous : Grille horaire", () => {
    const baseValide = { npi: "0102030405", service: "PERMIS" };

    it("accepte 08:00 et 15:30", () => {
      expect(verifierPriseRendezVous({ dateHeure: "2026-11-23T08:00", ...baseValide }, [], now)).toEqual({ ok: true });
      expect(verifierPriseRendezVous({ dateHeure: "2026-11-23T15:30", ...baseValide }, [], now)).toEqual({ ok: true });
    });

    const heuresRefusees = [
      "2026-11-23T07:30",
      "2026-11-23T07:59",
      "2026-11-23T08:15",
      "2026-11-23T15:45",
      "2026-11-23T16:00",
      "2026-11-23T12:10",
      "2026-11-23T00:00",
    ];

    it.each(heuresRefusees)("refuse l'heure hors grille : %s", (dateHeure) => {
      const res = verifierPriseRendezVous({ dateHeure, ...baseValide }, [], now);
      expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.HORS_GRILLE });
    });
  });

  describe("Prise de rendez-vous : Unicité du rendez-vous à venir", () => {
    const npi = "0102030405";

    it("un rendez-vous confirme passé ne bloque pas", () => {
      const existants: RendezVous[] = [
        { id: 1, npi, service: "PASSEPORT", dateHeure: "2026-11-19 10:00:00", statut: "confirme" }
      ];
      const res = verifierPriseRendezVous({ npi, service: "CNI", dateHeure: "2026-11-23T09:00" }, existants, now);
      expect(res).toEqual({ ok: true });
    });

    it("un rendez-vous annule, honore ou absent (même futur) ne bloque pas", () => {
      const existants: RendezVous[] = [
        { id: 1, npi, service: "PASSEPORT", dateHeure: "2026-11-25 10:00:00", statut: "annule" },
        { id: 2, npi, service: "CNI", dateHeure: "2026-11-26 10:00:00", statut: "honore" },
        { id: 3, npi, service: "PERMIS", dateHeure: "2026-11-27 10:00:00", statut: "absent" },
      ];
      const res = verifierPriseRendezVous({ npi, service: "PERMIS", dateHeure: "2026-11-24T09:00" }, existants, now);
      expect(res).toEqual({ ok: true });
    });

    it("un autre NPI avec rendez-vous à venir ne bloque pas le demandeur", () => {
      const existants: RendezVous[] = [
        { id: 1, npi: "9999999999", service: "PASSEPORT", dateHeure: "2026-11-25 10:00:00", statut: "confirme" }
      ];
      const res = verifierPriseRendezVous({ npi, service: "PERMIS", dateHeure: "2026-11-25T09:00" }, existants, now);
      expect(res).toEqual({ ok: true });
    });
  });

  describe("Prise de rendez-vous : Capacité du créneau et créneaux voisins", () => {
    it("ne compte pas les rendez-vous sur un créneau voisin (+30 min)", () => {
      const existants: RendezVous[] = [
        { id: 1, npi: "1111111111", service: "PASSEPORT", dateHeure: "2026-11-23T09:00", statut: "confirme" },
        { id: 2, npi: "2222222222", service: "CNI", dateHeure: "2026-11-23T09:00", statut: "confirme" },
        { id: 3, npi: "3333333333", service: "PERMIS", dateHeure: "2026-11-23T09:00", statut: "confirme" },
      ];
      // Demande à 09:30 (créneau suivant) : doit être accepté
      const res = verifierPriseRendezVous(
        { npi: "4444444444", service: "PASSEPORT", dateHeure: "2026-11-23T09:30" },
        existants,
        now
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe("Annulation : Priorité statut avant délai", () => {
    it("renvoie 'ne peut plus être annulé' avant 'délai tardif' pour un RDV déjà honoré à moins de 24 h", () => {
      const rdv: RendezVous = {
        id: 10,
        npi: "0102030405",
        service: "CNI",
        dateHeure: "2026-11-20 20:00:00", // à 2 heures de now
        statut: "honore",
      };
      const res = verifierAnnulation(rdv, now);
      expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.ANNULATION_NON_CONFIRME });
    });

    it("accepte l'annulation à 24 h + 1 min (1441 min)", () => {
      const rdv: RendezVous = {
        id: 11,
        npi: "0102030405",
        service: "CNI",
        dateHeure: "2026-11-21 18:01:00",
        statut: "confirme",
      };
      expect(verifierAnnulation(rdv, now)).toEqual({ ok: true });
    });

    it("refuse à 0 h ou pour un rendez-vous déjà passé", () => {
      const rdv0h: RendezVous = {
        id: 12,
        npi: "0102030405",
        service: "CNI",
        dateHeure: "2026-11-20 18:00:00",
        statut: "confirme",
      };
      expect(verifierAnnulation(rdv0h, now)).toEqual({
        ok: false,
        status: 409,
        message: MESSAGES.ANNULATION_TARDIVE,
      });

      const rdvPasse: RendezVous = {
        id: 13,
        npi: "0102030405",
        service: "CNI",
        dateHeure: "2026-11-19 10:00:00",
        statut: "confirme",
      };
      expect(verifierAnnulation(rdvPasse, now)).toEqual({
        ok: false,
        status: 409,
        message: MESSAGES.ANNULATION_TARDIVE,
      });
    });
  });

  describe("Changement de statut : Priorité du contrôle du statut demandé", () => {
    it("contrôle le statut demandé AVANT l'état du rendez-vous", () => {
      const rdvAnnule: RendezVous = {
        id: 20,
        npi: "0102030405",
        service: "PERMIS",
        dateHeure: "2026-11-25 10:00:00",
        statut: "annule",
      };
      // Demande invalide "HONORE" (majuscules) sur un RDV annulé : doit renvoyer 400 STATUT_INCONNU
      expect(verifierChangementStatut(rdvAnnule, "HONORE")).toEqual({
        ok: false,
        status: 400,
        message: MESSAGES.STATUT_INCONNU,
      });

      expect(verifierChangementStatut(rdvAnnule, 123)).toEqual({
        ok: false,
        status: 400,
        message: MESSAGES.STATUT_INCONNU,
      });
    });
  });

  describe("Liste des rendez-vous : Robustesse des paramètres", () => {
    it("gère un usager sans aucun rendez-vous", () => {
      const res = listerRendezVousUsager([], "9999999999", now, 1, 10);
      expect(res).toEqual({
        page: 1,
        parPage: 10,
        total: 0,
        totalPages: 0,
        rendezVous: [],
      });
    });

    it("normalise page = 'a' ou 0 en page 1", () => {
      const rdv: RendezVous[] = [
        { id: 1, npi: "0102030405", service: "CNI", dateHeure: "2026-11-25 10:00:00", statut: "confirme" }
      ];
      expect(listerRendezVousUsager(rdv, "0102030405", now, "a" as any, 10).page).toBe(1);
      expect(listerRendezVousUsager(rdv, "0102030405", now, 0, 10).page).toBe(1);
    });
  });
});
