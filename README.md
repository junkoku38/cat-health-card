# Cat Health Card

Carte Lovelace de suivi santé pour chat, conçue pour le package
`chat_minou.yaml` (input_datetime vétérinaire / vaccin / vermifuge, poids cible,
moyenne 7 j, compteur de visites, état de santé).

**Auto-détection** : si le package n'est pas installé, la carte retombe
seule sur les capteurs de la litière (ex. `ha-neakasa-litterbox` :
`sensor.<chat>_weight`, `sensor.<chat>_visits_today`, `sensor.<chat>_last_visit`).

## Fonctionnalités

- **État de santé** (pastille ok / surveiller / alerte) : lu depuis l'entité
  template du package, ou recalculé par la carte avec **seuils configurables** —
  raisons affichées
- **Poids** : valeur actuelle, écart vs moyenne 7 j, courbe 14 jours,
  cible avec barre de progression (verte à ±5 %, orange à ±15 %)
- **Litière aujourd'hui** : passages du jour, dernier passage et durée de la visite
- **Événements** : prochain vaccin (retard signalé), dernier vétérinaire,
  dernier vermifuge — code couleur selon l'ancienneté (seuils configurables)
- **Notes** : `input_text.<chat>_notes` affiché s'il est renseigné
- Chaque élément est cliquable (plus d'infos de l'entité)
- **Auto-détection par fusion** : package et capteurs de litière combinés
  champ par champ (le package fournit les input_datetime, la litière le poids…)
- **Éditeur visuel complet** : sélecteurs d'entités par rôle, seuils de santé

## Installation

Manuelle :
1. Copier `cat-health-card.js` dans `/config/www/`
2. Ressources Lovelace : `/local/cat-health-card.js` (Module JavaScript)

HACS : Dépôts personnalisés → `https://github.com/junkoku38/cat-health-card`, catégorie Lovelace.

## Configuration

```yaml
type: custom:cat-health-card
cat_name: Minou          # détermine toutes les entités
name: Minou              # optionnel, titre affiché
show_notes: true         # optionnel, afficher input_text.<chat>_notes
entities:                # optionnel : surcharge par rôle (détecté sinon)
  weight: sensor.luna_weight
  visits: sensor.luna_visits_today
thresholds:              # optionnel : seuils de santé (défauts du package)
  visits_warn: 6         # visites/jour → surveiller
  visits_alert: 8        # visites/jour → alerte
  hours_warn: 16         # heures sans visite → surveiller
  hours_alert: 24        # heures sans visite → alerte
  weight_warn: 5         # écart % vs moyenne → surveiller
  weight_alert: 10       # écart % vs moyenne → alerte
  vet_warn_days: 300     # ancienneté véto/vermifuge → orange
  vet_alert_days: 365    # ancienneté véto/vermifuge → rouge
```

L'auto-detection **fusionne** le package et la litière champ par champ :
`sensor.<chat>_poids` **ou** `sensor.<chat>_weight` pour le poids,
`sensor.<chat>_visites_du_jour` **ou** `sensor.<chat>_visits_today` pour les
passages, etc. Les `input_datetime` du package s'ajoutent par-dessus.

## Entités utilisées

**Package `chat_<chat>.yaml`** (prioritaire) :

| Rôle | Entité |
|---|---|
| Poids | `sensor.<chat>_poids` |
| Moyenne 7 j | `sensor.<chat>_poids_moyen_7j` |
| Visites du jour | `sensor.<chat>_visites_du_jour` |
| Dernière visite | `sensor.<chat>_derniere_visite` |
| État de santé | `sensor.<chat>_etat_de_sante` (+ attribut `raison`) |
| Poids cible | `input_number.<chat>_poids_cible` |
| Vétérinaire | `input_datetime.<chat>_dernier_veterinaire` |
| Prochain vaccin | `input_datetime.<chat>_prochain_vaccin` |
| Vermifuge | `input_datetime.<chat>_dernier_vermifuge` |
| Notes | `input_text.<chat>_notes` |

**Litière** (secours, ex. ha-neakasa-litterbox) :

| Rôle | Entité |
|---|---|
| Poids | `sensor.<chat>_weight` |
| Visites du jour | `sensor.<chat>_visits_today` |
| Dernière visite | `sensor.<chat>_last_visit` |

## Licence

MIT