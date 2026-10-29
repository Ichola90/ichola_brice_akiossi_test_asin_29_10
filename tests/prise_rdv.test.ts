import { describe, it, expect } from "vitest";
import { verifierPriseRendezVous } from "../src/regles.js";
import { MESSAGES, RendezVous } from "../src/types.js";

describe("verifierPriseRendezVous", () => {
  const now = "2026-11-20T18:00"; // Vendredi 20 novembre 2026 à 18h00

  it("accepte un rendez-vous valide sur un créneau libre", () => {
    const res = verifierPriseRendezVous(
      { npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-23T08:00" },
      [],
      now
    );
    expect(res).toEqual({ ok: true });
  });

  it("rejette un NPI invalide (format, longueur, type) avec code 400", () => {
    // 9 chiffres
    expect(verifierPriseRendezVous({ npi: "123456789", service: "CNI", dateHeure: "2026-11-23T08:00" }, [], now))
      .toEqual({ ok: false, status: 400, message: MESSAGES.NPI_INVALIDE });
    // Lettre dans NPI (TMA-103)
    expect(verifierPriseRendezVous({ npi: "06142A3647", service: "CNI", dateHeure: "2026-11-23T08:00" }, [], now))
      .toEqual({ ok: false, status: 400, message: MESSAGES.NPI_INVALIDE });
    // Nombre au lieu de chaîne
    expect(verifierPriseRendezVous({ npi: 102030405 as any, service: "CNI", dateHeure: "2026-11-23T08:00" }, [], now))
      .toEqual({ ok: false, status: 400, message: MESSAGES.NPI_INVALIDE });
  });

  it("rejette un service inconnu avec code 400", () => {
    expect(verifierPriseRendezVous({ npi: "0102030405", service: "CARTE_GRISE", dateHeure: "2026-11-23T08:00" }, [], now))
      .toEqual({ ok: false, status: 400, message: MESSAGES.SERVICE_INCONNU });
  });

  it("rejette une date invalide avec code 400", () => {
    expect(verifierPriseRendezVous({ npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-02-30T10:00" }, [], now))
      .toEqual({ ok: false, status: 400, message: MESSAGES.DATE_INVALIDE });
  });

  it("rejette une date passée (< now) avec code 409", () => {
    expect(verifierPriseRendezVous({ npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-20T09:00" }, [], now))
      .toEqual({ ok: false, status: 409, message: MESSAGES.DATE_PASSEE });
  });

  it("rejette un rendez-vous le week-end avec code 409 (TMA-101)", () => {
    // Samedi 21 novembre 2026
    expect(verifierPriseRendezVous({ npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-21T10:00" }, [], now))
      .toEqual({ ok: false, status: 409, message: MESSAGES.FERME_WEEKEND });
  });

  it("rejette un créneau hors grille avec code 409", () => {
    // 07:30 (avant 08:00)
    expect(verifierPriseRendezVous({ npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-23T07:30" }, [], now))
      .toEqual({ ok: false, status: 409, message: MESSAGES.HORS_GRILLE });
    // 16:00 (après 15:30)
    expect(verifierPriseRendezVous({ npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-23T16:00" }, [], now))
      .toEqual({ ok: false, status: 409, message: MESSAGES.HORS_GRILLE });
    // 10:15 (pas un multiple de 30 min)
    expect(verifierPriseRendezVous({ npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-23T10:15" }, [], now))
      .toEqual({ ok: false, status: 409, message: MESSAGES.HORS_GRILLE });
  });

  it("rejette si l'usager a déjà un rendez-vous à venir (statut confirme)", () => {
    const existants: RendezVous[] = [
      { id: 1, npi: "0102030405", service: "CNI", dateHeure: "2026-11-24T10:00", statut: "confirme" }
    ];
    const res = verifierPriseRendezVous(
      { npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-25T14:00" },
      existants,
      now
    );
    expect(res).toEqual({ ok: false, status: 409, message: MESSAGES.DEJA_A_VENIR });
  });

  it("accepte si le rendez-vous précédent confirmé est DÉJÀ PASSÉ", () => {
    const existants: RendezVous[] = [
      { id: 1, npi: "0102030405", service: "CNI", dateHeure: "2026-11-19T10:00", statut: "confirme" }
    ];
    const res = verifierPriseRendezVous(
      { npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-25T14:00" },
      existants,
      now
    );
    expect(res).toEqual({ ok: true });
  });

  it("rejette un créneau complet (>= 3 non-annulés) mais accepte si un est annulé (TMA-102)", () => {
    const rdvCreneau: RendezVous[] = [
      { id: 10, npi: "1111111111", service: "PASSEPORT", dateHeure: "2026-11-23T10:00", statut: "confirme" },
      { id: 11, npi: "2222222222", service: "CNI", dateHeure: "2026-11-23T10:00", statut: "confirme" },
      { id: 12, npi: "3333333333", service: "PERMIS", dateHeure: "2026-11-23T10:00", statut: "confirme" },
    ];
    // 4ème demande sur le même créneau
    const resPlein = verifierPriseRendezVous(
      { npi: "4444444444", service: "PASSEPORT", dateHeure: "2026-11-23T10:00" },
      rdvCreneau,
      now
    );
    expect(resPlein).toEqual({ ok: false, status: 409, message: MESSAGES.CRENEAU_COMPLET });

    // Si l'un des trois est annulé, la place est libérée
    const rdvAvecUnAnnule: RendezVous[] = [
      { id: 10, npi: "1111111111", service: "PASSEPORT", dateHeure: "2026-11-23T10:00", statut: "confirme" },
      { id: 11, npi: "2222222222", service: "CNI", dateHeure: "2026-11-23T10:00", statut: "annule" },
      { id: 12, npi: "3333333333", service: "PERMIS", dateHeure: "2026-11-23T10:00", statut: "confirme" },
    ];
    const resLibre = verifierPriseRendezVous(
      { npi: "4444444444", service: "PASSEPORT", dateHeure: "2026-11-23T10:00" },
      rdvAvecUnAnnule,
      now
    );
    expect(resLibre).toEqual({ ok: true });
  });

  it("accepte un créneau si now est exactement égal à l'heure du créneau", () => {
    // now = 2026-11-23T08:00, creneau = 2026-11-23T08:00
    const res = verifierPriseRendezVous(
      { npi: "0102030405", service: "PASSEPORT", dateHeure: "2026-11-23T08:00" },
      [],
      "2026-11-23T08:00"
    );
    expect(res).toEqual({ ok: true });
  });
});
