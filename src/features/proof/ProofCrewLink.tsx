import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepo } from '../../app/useRepo.ts';
import { copy } from '../../ui/copy.ts';
import { loadProof } from './model.ts';
export default function ProofCrewLink() {
  const repo = useRepo();
  const card = useLiveQuery(async () => (await loadProof(repo)).cards.find((c) => c.together) ?? null, [repo]);
  if (card === undefined) return null;
  return <Link className="ui-button ui-button--secondary" style={{ margin: 16 }} to={card ? `/proof?card=${card.id}` : '/proof'}>{copy.y9CrewLink}</Link>;
}
