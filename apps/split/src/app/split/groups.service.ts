import { inject } from '@ee/di';
import HttpErrors from 'http-errors';
import { Database } from '../data-source';
import { UsersService } from '../users/users.service';
import { BalancesService } from './balances.service';
import { Group, GroupMember } from './group.entity';
import { toGroupDto, toGroupMemberDto } from './mappers';
import {
  CreateGroupInput,
  GroupSummaryOut,
  UpdateGroupInput,
} from './split.types';

export class GroupsService {
  private readonly _groupRepository = inject(Database).repositoryFor(Group);
  private readonly _memberRepository =
    inject(Database).repositoryFor(GroupMember);
  private readonly _usersService = inject(UsersService);
  private readonly _balancesService = inject(BalancesService);

  /** Throw unless the user is a member of the group; returns the group. */
  async assertMember(groupId: string, userId: string): Promise<Group> {
    const group = await this._groupRepository.findOne({
      where: { id: groupId },
    });
    if (!group) {
      throw new HttpErrors.NotFound('Group not found');
    }
    const membership = await this._memberRepository.findOne({
      where: { group: { id: groupId }, user: { id: userId } },
    });
    if (!membership) {
      throw new HttpErrors.Forbidden('You are not a member of this group');
    }
    return group;
  }

  private async loadMembers(groupId: string): Promise<GroupMember[]> {
    return this._memberRepository.find({
      where: { group: { id: groupId } },
      order: { joinedAt: 'ASC' },
    });
  }

  async listForUser(userId: string): Promise<GroupSummaryOut[]> {
    const memberships = await this._memberRepository.find({
      where: { user: { id: userId } },
      relations: { group: true },
    });

    const summaries: GroupSummaryOut[] = [];
    for (const membership of memberships) {
      const group = await this._groupRepository.findOne({
        where: { id: membership.group.id },
      });
      if (!group) continue;

      const members = await this.loadMembers(group.id);
      const net = await this._balancesService.computeNet(group.id);

      summaries.push({
        id: group.id,
        name: group.name,
        description: group.description ?? null,
        type: group.type,
        currency: group.currency,
        memberCount: members.length,
        members: members.map(toGroupMemberDto),
        yourBalanceCents: net.get(userId) ?? 0,
        updatedAt: group.updatedAt,
      });
    }

    summaries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return summaries;
  }

  async getById(groupId: string, userId: string) {
    const group = await this.assertMember(groupId, userId);
    const members = await this.loadMembers(groupId);
    return toGroupDto(group, members);
  }

  async create(userId: string, input: CreateGroupInput) {
    const creator = await this._usersService.findEntityById(userId);
    if (!creator) {
      throw new HttpErrors.Unauthorized('User not found');
    }

    const group = await this._groupRepository.save(
      this._groupRepository.create({
        name: input.name,
        description: input.description,
        type: input.type,
        currency: input.currency,
        createdBy: creator,
      })
    );

    // Always add the creator as a member.
    await this.addMemberEntity(group, creator.id);

    // Add any requested members by username (ignore unknown/duplicate).
    for (const username of input.memberUsernames ?? []) {
      const user = await this._usersService.findEntityByUsername(username);
      if (user && user.id !== creator.id) {
        await this.addMemberEntity(group, user.id);
      }
    }

    const members = await this.loadMembers(group.id);
    return toGroupDto(group, members);
  }

  async update(groupId: string, userId: string, input: UpdateGroupInput) {
    await this.assertMember(groupId, userId);
    await this._groupRepository.update(groupId, input);
    const group = await this._groupRepository.findOneByOrFail({ id: groupId });
    const members = await this.loadMembers(groupId);
    return toGroupDto(group, members);
  }

  async remove(groupId: string, userId: string) {
    await this.assertMember(groupId, userId);
    await this._groupRepository.delete(groupId);
    return { success: true };
  }

  private async addMemberEntity(group: Group, userId: string) {
    const existing = await this._memberRepository.findOne({
      where: { group: { id: group.id }, user: { id: userId } },
    });
    if (existing) return existing;
    return this._memberRepository.save(
      this._memberRepository.create({
        group,
        user: { id: userId } as any,
      })
    );
  }

  async addMember(groupId: string, userId: string, username: string) {
    const group = await this.assertMember(groupId, userId);
    const user = await this._usersService.findEntityByUsername(username);
    if (!user) {
      throw new HttpErrors.NotFound(`No user with username "${username}"`);
    }
    await this.addMemberEntity(group, user.id);
    const members = await this.loadMembers(groupId);
    return toGroupDto(group, members);
  }

  async removeMember(groupId: string, userId: string, memberUserId: string) {
    await this.assertMember(groupId, userId);

    const net = await this._balancesService.computeNet(groupId);
    if ((net.get(memberUserId) ?? 0) !== 0) {
      throw new HttpErrors.BadRequest(
        'Cannot remove a member who still has a non-zero balance'
      );
    }

    await this._memberRepository.delete({
      group: { id: groupId },
      user: { id: memberUserId },
    });

    const group = await this._groupRepository.findOneByOrFail({ id: groupId });
    const members = await this.loadMembers(groupId);
    return toGroupDto(group, members);
  }

  async getBalances(groupId: string, userId: string) {
    const group = await this.assertMember(groupId, userId);
    return this._balancesService.getGroupBalances(group);
  }
}
