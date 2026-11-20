import { LOST, RETURNED, type BeamNote } from '../../shared/beam';
import { fmtCount, lampShort } from '../lib/geometry';

const outcomeLabel = (o: number) =>
  o === LOST ? 'lost' : o === RETURNED ? 'came back' : `→ ${lampShort(o)}`;

const verdict = (skill: number, before: number) => {
  if (before <= 1) return 'fog was already clear';
  if (skill >= 90) return 'expert pick';
  if (skill >= 65) return 'strong';
  if (skill >= 35) return 'decent';
  return 'little new light';
};

/** WordleBot for the fog: what each beam cleared, and what the expert would have lit. */
export const BeamLog = ({
  notes,
  expertLine,
  size,
}: {
  notes: BeamNote[];
  expertLine: number[];
  size: number;
}) => {
  const avg = notes.length
    ? Math.round(notes.reduce((a, n) => a + n.skill, 0) / notes.length)
    : 0;
  const last = notes.at(-1);
  return (
    <div className="beamlog" style={{ width: size, height: size }}>
      <div className="beamlog-head">
        <span>
          Skill <b>{avg}</b>
        </span>
        <span>
          {fmtCount(notes[0]?.before ?? 0)} layouts →{' '}
          <b>{fmtCount(last?.after ?? 0)}</b>
        </span>
      </div>
      <p className="beamlog-explain">
        Each beam narrows down where the rocks could be. Bigger drops = better
        beams. “Expert” is the lamp that would have narrowed it most.
      </p>
      <ol className="beamlog-list">
        {notes.map((n, i) => (
          <li key={n.port}>
            <span className="bl-idx">{i + 1}</span>
            <span className="bl-lamp">
              {lampShort(n.port)}
              {n.borrowed && <em> borrowed</em>}
              <small>{outcomeLabel(n.outcome)}</small>
            </span>
            <span className="bl-fog">
              <span>
                {fmtCount(n.before)} → <b>{fmtCount(n.after)}</b>
              </span>
              <small>
                {verdict(n.skill, n.before)}
                {n.skill < 90 &&
                  n.before > 1 &&
                  ` · expert: ${lampShort(n.bestPort)}`}
              </small>
            </span>
            <span className="bl-bar" aria-label={`skill ${n.skill}`}>
              <i style={{ width: `${n.skill}%` }} />
            </span>
          </li>
        ))}
      </ol>
      {last && last.after > 1 && (
        <p className="beamlog-warn">
          You charted with {fmtCount(last.after)} layouts still possible — that
          was a guess. Keep firing until the fog meter reads 1.
        </p>
      )}
      <p className="beamlog-foot">
        Expert line ({expertLine.length}):{' '}
        {expertLine.map(lampShort).join(' · ')}
      </p>
    </div>
  );
};
