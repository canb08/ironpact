import { createMockRemote } from '../../../src/data/adapter.mock.ts';
import { runRepoContract } from './repo.contract.ts';

runRepoContract(({ now }) => createMockRemote({ now }));

import { runPartnerPrContract } from './partner-pr.contract.ts';
runPartnerPrContract(async () => {
  const owner = createMockRemote();
  return { owner, async asPartner() { await owner.verifyCode('bob@example.test', '123456'); return owner; } };
});
