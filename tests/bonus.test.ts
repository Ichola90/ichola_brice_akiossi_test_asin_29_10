import { describe, it, expect } from "vitest";
import {
  verifierPriseRendezVous,
  verifierChangementStatut,
  auditerConformiteRendezVous,
} from "../src/regles.js";
import { MESSAGES, RendezVous } from "../src/types.js";

describe("Tests des anomalies cachées et outillage TMA (Bonus)", () => {
  const now = "2026-11-20T18:00:00";

  describe("Bonus 1 : NPI non conformes en base (11 et 12 chiffres)", () => {
    // Cas réels trouvés dans l'export SQL :
    // id 459 : '01234567890' (11 chiffres)
    // id 642 : '061425364711' (12 chiffres)
    it("rejette la réservation pour un NPI de 11 chiffres (cas du rdv 459)", () => {
      const res = verifierPriseRendezVous(
        { npi: "01234567890", service: "PERMIS", dateHeure: "2026-11-23T09:30" },
        [],
        now
      );
      expect(res).toEqual({ ok: false, status: 400, message: MESSAGES.NPI_INVALIDE });
    });

    it("rejette la réservation pour un NPI de 12 chiffres (cas du rdv 642)", () => {
      const res = verifierPriseRendezVous(
        { npi: "061425364711", service: "PERMIS", dateHeure: "2026-11-23T14:00" },
        [],
        now
      );
      expect(res).toEqual({ ok: false, status: 400, message: MESSAGES.NPI_INVALIDE });
    });

    it("auditerConformiteRendezVous détecte les NPI non conformes", () => {
      const rdv459: RendezVous = {
        id: 459,
        npi: "01234567890",
        service: "PERMIS",
        dateHeure: "2026-10-20 09:30:00",
        statut: "absent",
      };
      const anomalies = auditerConformiteRendezVous(rdv459);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0]?.champ).toBe("npi");
    });
  });

  describe("Bonus 2 : Heures hors grille (16:00 et 16:30)", () => {
    // Cas réels de l'export SQL :
    // id 490 (16:00:00), id 698 (16:30:00), id 842 (16:00:00 - à venir !)
    it("rejette la demande pour un créneau à 16:00 (cas du rdv 842)", () => {
      const res = verifierPriseRendezVous(
        { npi: "0387129160", service: "PASSEPORT", dateHeure: "2026-12-08T16:00" },
        [],
        now
      );
      expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.HORS_GRILLE });
    });

    it("rejette la demande pour un créneau à 16:30 (cas du rdv 698)", () => {
      const res = verifierPriseRendezVous(
        { npi: "0051291680", service: "PASSEPORT", dateHeure: "2026-11-23T16:30" },
        [],
        now
      );
      expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.HORS_GRILLE });
    });

    it("auditerConformiteRendezVous détecte les créneaux hors grille", () => {
      const rdv842: RendezVous = {
        id: 842,
        npi: "0387129160",
        service: "PASSEPORT",
        dateHeure: "2026-12-08 16:00:00",
        statut: "confirme",
      };
      const anomalies = auditerConformiteRendezVous(rdv842);
      expect(anomalies.some((a) => a.champ === "dateHeure" && a.description.includes("grille"))).toBe(true);
    });
  });

  describe("Bonus 3 : Rendez-vous confirmés du passé non clôturés (ids 475, 715, 742)", () => {
    it("ne bloque pas un usager ayant un rendez-vous confirmé passé non clôturé", () => {
      // Usager 0610057414 a le rdv 475 le 31/10 (passé), toujours 'confirme'
      const rdvPasseNonCloture: RendezVous = {
        id: 475,
        npi: "0610057414",
        service: "PASSEPORT",
        dateHeure: "2026-10-31 09:00:00",
        statut: "confirme",
      };

      const res = verifierPriseRendezVous(
        { npi: "0610057414", service: "PASSEPORT", dateHeure: "2026-11-25T10:00" },
        [rdvPasseNonCloture],
        now
      );

      expect(res).toEqual({ ok: true });
    });
  });

  describe("Bonus 4 : Même usager sur le même créneau pour deux services (cas rdv 43 & 99)", () => {
    it("interdit à un usager de prendre un 2e rendez-vous au même créneau", () => {
      const rdv43: RendezVous = {
        id: 43,
        npi: "0536455681",
        service: "PERMIS",
        dateHeure: "2026-11-24 09:30:00",
        statut: "confirme",
      };

      const res = verifierPriseRendezVous(
        { npi: "0536455681", service: "PASSEPORT", dateHeure: "2026-11-24T09:30" },
        [rdv43],
        now
      );

      // Bloqué par la règle 'un seul rendez-vous à venir'
      expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.DEJA_A_VENIR });
    });
  });

  describe("Bonus 5 : Les 4 réactivations illicites après annulation (208, 231, 262, 292)", () => {
    const casReactivations: RendezVous[] = [
      { id: 208, npi: "0384914669", service: "PASSEPORT", dateHeure: "2026-10-07 10:20:00", statut: "annule" },
      { id: 231, npi: "0370202195", service: "PASSEPORT", dateHeure: "2026-10-15 10:26:00", statut: "annule" },
      { id: 262, npi: "0317656053", service: "PERMIS", dateHeure: "2026-10-29 10:21:00", statut: "annule" },
      { id: 292, npi: "0330677555", service: "PASSEPORT", dateHeure: "2026-11-12 10:13:00", statut: "annule" },
    ];

    it.each(casReactivations)(
      "refuse la clôture pour le rendez-vous annulé id $id",
      (rdv) => {
        const res = verifierChangementStatut(rdv, "honore");
        expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.DEJA_CLOTURE });
      }
    );
  });
});
