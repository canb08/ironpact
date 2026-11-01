import { createMockRemote } from '../../../src/data/adapter.mock.ts';
import { runRepoContract } from './repo.contract.ts';

runRepoContract(({ now }) => createMockRemote({ now }));
