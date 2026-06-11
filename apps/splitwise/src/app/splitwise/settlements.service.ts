import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { UsersService } from '../users/users.service';
import { GroupMember } from './group.entity';
import { GroupsService } from './groups.service';
import { toSettlementDto } from './mappers';
import { Settlement } from './settlement.entity';
import { CreateSettlementInput, SettlementOut } from './splitwise.types';

export class SettlementsService {
  private readonly _settlementRepository =
    inject(Database).repositoryFor(Settlement);
  private readonly _memberRepository =
    inject(Database).repositoryFor(GroupMember);
  private readonly _groupsService = inject(GroupsService);
  private readonly _usersService = inject(UsersService);

  async list(groupId: string, userId: string): Promise<SettlementOut[]> {
    await this._groupsService.assertMember(groupId, userId);
    const settlements = await this._settlementRepository.find({
      where: { group: { id: groupId } },
      order: { date: 'DESC', createdAt: 'DESC' },
    });
    return settlements.map(toSettlementDto);
  }

  async create(
    groupId: string,
    userId: string,
    input: CreateSettlementInput
  ): Promise<SettlementOut> {
    const group = await this._groupsService.assertMember(groupId, userId);

    if (input.fromUserId === input.toUserId) {
      throw new HttpErrors.BadRequest('Payer and recipient must differ');
    }

    const members = await this._memberRepository.find({
      where: { group: { id: groupId } },
    });
    const memberIds = new Set(members.map((m) => m.user.id));
    if (!memberIds.has(input.fromUserId) || !memberIds.has(input.toUserId)) {
      throw new HttpErrors.BadRequest('Both users must be members of the group');
    }

    const creator = await this._usersService.findEntityById(userId);

    const settlement = this._settlementRepository.create({
      group,
      fromUser: { id: input.fromUserId } as any,
      toUser: { id: input.toUserId } as any,
      amountCents: Math.round(input.amount * 100),
      currency: input.currency || group.currency,
      note: input.note,
      date: input.date ? new Date(input.date) : new Date(),
      createdBy: creator ?? undefined,
    });

    const saved = await this._settlementRepository.save(settlement);
    const full = await this._settlementRepository.findOneByOrFail({
      id: saved.id,
    });
    return toSettlementDto(full);
  }

  async remove(settlementId: string, userId: string) {
    const settlement = await this._settlementRepository.findOne({
      where: { id: settlementId },
    });
    if (!settlement) {
      throw new HttpErrors.NotFound('Settlement not found');
    }
    await this._groupsService.assertMember(settlement.group.id, userId);
    await this._settlementRepository.delete(settlementId);
    return { success: true };
  }
}
