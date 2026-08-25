import type { Subject } from "@/lib/types";
import { buildShelves, badgeTooltip, type Badge, type BadgeIconKind } from "@/lib/scoreData";
import { ShieldIcon, StarIcon, RibbonIcon } from "@/components/icons";
import styles from "./TrophyCabinet.module.css";

const BADGE_ICONS: Record<BadgeIconKind, typeof ShieldIcon> = {
  shield: ShieldIcon,
  star: StarIcon,
  ribbon: RibbonIcon,
};

function Medallion({ badge }: { badge: Badge }) {
  const Icon = BADGE_ICONS[badge.icon];
  return (
    <div className={styles.medallionWrap} tabIndex={0}>
      <div className={`${styles.medallion} ${badge.unlocked ? styles.unlocked : styles.locked}`}>
        <Icon size={20} />
      </div>
      <span className={styles.tooltip}>{badgeTooltip(badge)}</span>
    </div>
  );
}

export default function TrophyCabinet({ subjects, streakDays }: { subjects: Subject[]; streakDays: number }) {
  const shelves = buildShelves(subjects, streakDays);
  const allBadges = shelves.flatMap((s) => s.badges);
  const unlockedCount = allBadges.filter((b) => b.unlocked).length;

  return (
    <div className={styles.cabinet}>
      {shelves.map((shelf, i) => (
        <div key={shelf.label} className={styles.shelf}>
          <p className={styles.shelfLabel}>{shelf.label}</p>
          <div className={styles.shelfRow}>
            {shelf.badges.map((badge) => (
              <Medallion key={badge.id} badge={badge} />
            ))}
          </div>
          {i < shelves.length - 1 && <div className={styles.shelfDivider} />}
        </div>
      ))}

      <div className={styles.footer}>
        {unlockedCount} of {allBadges.length} badges unlocked
      </div>
    </div>
  );
}
