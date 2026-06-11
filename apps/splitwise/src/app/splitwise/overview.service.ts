import { inject } from '@ee/di';
import { Database } from '../data-source';
import { BalancesService } from './balances.service';
import { GroupMember } from './group.entity';
import { OverviewOut } from './splitwise.types';

export class OverviewService {
  private readonly _memberRepository =
    inject(Database).repositoryFor(GroupMember);
  private readonly _balancesService = inject(BalancesService);

  async forUser(userId: string): Promise<OverviewOut> {
    const memberships = await this._memberRepository.find({
      where: { user: { id: userId } },
      relations: { group: true },
    });

    let youAreOwedCents = 0;
    let youOweCents = 0;

    for (const membership of memberships) {
      const net = await this._balancesService.computeNet(membership.group.id);
      const balance = net.get(userId) ?? 0;
      if (balance > 0) youAreOwedCents += balance;
      else if (balance < 0) youOweCents += -balance;
    }

    return {
      currency: 'USD',
      youAreOwedCents,
      youOweCents,
      netCents: youAreOwedCents - youOweCents,
    };
  }
}
