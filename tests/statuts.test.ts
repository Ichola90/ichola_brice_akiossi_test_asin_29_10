import { describe, it, expect } from "vitest";
import { verifierAnnulation, verifierChangementStatut } from "../src/regles.js";
import { MESSAGES, RendezVous } from "../src/types.js";

describe("verifierAnnulation", () => {
  const rdvConfirme: RendezVous = {
    id: 709,
    npi: "0102030405",
    service: "PASSEPORT",
    dateHeure: "2026-11-19T10:00",
    statut: "confirme",
  };

  it("accepte l'annulation si le délai est de 40 heures (TMA-104)", () => {
    // 2026-11-17 à 18:00 -> rdv 2026-11-19 à 10:00 = 40 h d'avance
    const now = "2026-11-17T18:00";
    const res = verifierAnnulation(rdvConfirme, now);
    expect(res).toEqual({ ok: true });
  });

  it("accepte l'annulation à exactement 24 h pile", () => {
    const now = "2026-11-18T10:00";
    const res = verifierAnnulation(rdvConfirme, now);
    expect(res).toEqual({ ok: true });
  });

  it("refuse l'annulation à moins de 24 h (ex: 23 h 59)", () => {
    const now = "2026-11-18T10:01";
    const res = verifierAnnulation(rdvConfirme, now);
    expect(res).toEqual({
      ok: false,
      status: 409,
      message: MESSAGES.ANNULATION_TARDIVE,
    });
  });

  it("refuse l'annulation d'un rendez-vous non confirmé (déjà clôturé ou déjà annulé)", () => {
    const rdvAnnule: RendezVous = { ...rdvConfirme, statut: "annule" };
    expect(verifierAnnulation(rdvAnnule, "2026-11-17T18:00")).toEqual({
      ok: false,
      status: 409,
      message: MESSAGES.ANNULATION_NON_CONFIRME,
    });

    const rdvHonore: RendezVous = { ...rdvConfirme, statut: "honore" };
    expect(verifierAnnulation(rdvHonore, "2026-11-17T18:00")).toEqual({
      ok: false,
      status: 409,
      message: MESSAGES.ANNULATION_NON_CONFIRME,
    });

    const rdvAbsent: RendezVous = { ...rdvConfirme, statut: "absent" };
    expect(verifierAnnulation(rdvAbsent, "2026-11-17T18:00")).toEqual({
      ok: false,
      status: 409,
      message: MESSAGES.ANNULATION_NON_CONFIRME,
    });
  });
});

describe("verifierChangementStatut", () => {
  const rdvConfirme: RendezVous = {
    id: 100,
    npi: "0102030405",
    service: "PASSEPORT",
    dateHeure: "2026-11-20T10:00",
    statut: "confirme",
  };

  it("accepte le passage à 'honore' ou 'absent' pour un rendez-vous confirmé", () => {
    expect(verifierChangementStatut(rdvConfirme, "honore")).toEqual({ ok: true });
    expect(verifierChangementStatut(rdvConfirme, "absent")).toEqual({ ok: true });
  });

  it("refuse tout autre statut demandé avec code 400", () => {
    expect(verifierChangementStatut(rdvConfirme, "annule")).toEqual({
      ok: false,
      status: 400,
      message: MESSAGES.STATUT_INCONNU,
    });
    expect(verifierChangementStatut(rdvConfirme, "confirme")).toEqual({
      ok: false,
      status: 400,
      message: MESSAGES.STATUT_INCONNU,
    });
    expect(verifierChangementStatut(rdvConfirme, "en_attente")).toEqual({
      ok: false,
      status: 400,
      message: MESSAGES.STATUT_INCONNU,
    });
    expect(verifierChangementStatut(rdvConfirme, undefined)).toEqual({
      ok: false,
      status: 400,
      message: MESSAGES.STATUT_INCONNU,
    });
    expect(verifierChangementStatut(rdvConfirme, "")).toEqual({
      ok: false,
      status: 400,
      message: MESSAGES.STATUT_INCONNU,
    });
  });

  it("refuse le changement si le rendez-vous est déjà clôturé (TMA-105)", () => {
    const rdvAnnule: RendezVous = { ...rdvConfirme, statut: "annule" };
    expect(verifierChangementStatut(rdvAnnule, "honore")).toEqual({
      ok: false,
      status: 409,
      message: MESSAGES.DEJA_CLOTURE,
    });

    const rdvDejaHonore: RendezVous = { ...rdvConfirme, statut: "honore" };
    expect(verifierChangementStatut(rdvDejaHonore, "absent")).toEqual({
      ok: false,
      status: 409,
      message: MESSAGES.DEJA_CLOTURE,
    });

    const rdvDejaAbsent: RendezVous = { ...rdvConfirme, statut: "absent" };
    expect(verifierChangementStatut(rdvDejaAbsent, "honore")).toEqual({
      ok: false,
      status: 409,
      message: MESSAGES.DEJA_CLOTURE,
    });
  });
});
