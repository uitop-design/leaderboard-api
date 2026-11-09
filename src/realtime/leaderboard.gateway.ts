import { UseFilters } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AllExceptionsFilter } from '../common/errors/all-exceptions.filter.js';
import { SubscriptionDto } from './dto/subscription.dto.js';
import { RealtimeService, type SubscribeAck, type UnsubscribeAck } from './realtime.service.js';

@UseFilters(AllExceptionsFilter)
@WebSocketGateway({ namespace: '/leaderboards', cors: { origin: '*' } })
export class LeaderboardGateway implements OnGatewayInit<Namespace> {
  constructor(private readonly realtime: RealtimeService) {}

  afterInit(server: Namespace): void {
    this.realtime.attach(server);
  }

  @SubscribeMessage('subscribe')
  subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() { slug }: SubscriptionDto,
  ): Promise<SubscribeAck> {
    return this.realtime.subscribe(client, slug);
  }

  @SubscribeMessage('unsubscribe')
  unsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() { slug }: SubscriptionDto,
  ): Promise<UnsubscribeAck> {
    return this.realtime.unsubscribe(client, slug);
  }
}
