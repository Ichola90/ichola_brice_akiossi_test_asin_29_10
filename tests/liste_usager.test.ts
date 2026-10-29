import { describe, it, expect } from "vitest";
import { listerRendezVousUsager } from "../src/regles.js";
import { RendezVous } from "../src/types.js";

describe("listerRendezVousUsager", () => {
  const now = "2026-11-20T18:00:00";

  // Les 13 rendez-vous de l'usager 0203040506 extraits de base_rendez_vous.sql
  const rdvUsager0203040506: RendezVous[] = [
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

  it("TMA-106 : met le prochain rendez-vous (id 826) en tête, suivi des autres par date décroissante", () => {
    // Page 1
    const resPage1 = listerRendezVousUsager(rdvUsager0203040506, "0203040506", now, 1, 10);
    expect(resPage1.total).toBe(13);
    expect(resPage1.totalPages).toBe(2);
    expect(resPage1.page).toBe(1);
    expect(resPage1.rendezVous).toHaveLength(10);

    // Le tout premier doit être le rendez-vous futur confirmé (id 826)
    expect(resPage1.rendezVous[0]?.id).toBe(826);

    // Les suivants sur la page 1 doivent être classés par date_heure décroissante
    const idsPage1 = resPage1.rendezVous.map((r) => r.id);
    expect(idsPage1).toEqual([826, 259, 11, 10, 9, 8, 7, 6, 5, 4]);

    // Page 2
    const resPage2 = listerRendezVousUsager(rdvUsager0203040506, "0203040506", now, 2, 10);
    expect(resPage2.page).toBe(2);
    expect(resPage2.rendezVous).toHaveLength(3);
    const idsPage2 = resPage2.rendezVous.map((r) => r.id);
    expect(idsPage2).toEqual([3, 2, 1]);
  });

  it("gère une page au-delà du total en renvoyant une liste vide", () => {
    const resPage3 = listerRendezVousUsager(rdvUsager0203040506, "0203040506", now, 3, 10);
    expect(resPage3.page).toBe(3);
    expect(resPage3.rendezVous).toEqual([]);
  });

  it("normalise une page négative ou invalide à 1", () => {
    const resNeg = listerRendezVousUsager(rdvUsager0203040506, "0203040506", now, -1, 10);
    expect(resNeg.page).toBe(1);
    expect(resNeg.rendezVous[0]?.id).toBe(826);

    const resNaN = listerRendezVousUsager(rdvUsager0203040506, "0203040506", now, NaN, 10);
    expect(resNaN.page).toBe(1);
  });

  it("départage par id décroissant en cas d'égalité stricte de date_heure", () => {
    const rdvMemesDates: RendezVous[] = [
      { id: 10, npi: "9999999999", service: "PASSEPORT", dateHeure: "2026-10-10 10:00:00", statut: "honore" },
      { id: 25, npi: "9999999999", service: "CNI", dateHeure: "2026-10-10 10:00:00", statut: "absent" },
    ];
    const res = listerRendezVousUsager(rdvMemesDates, "9999999999", now, 1, 10);
    expect(res.rendezVous.map((r) => r.id)).toEqual([25, 10]);
  });
});
