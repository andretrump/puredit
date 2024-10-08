import { Action, Message, MessagePayload, MessageType } from "@puredit/webview-interface";
import { v4 as uuid } from "uuid";

import { logProvider } from "../../logconfig";
const logger = logProvider.getLogger("vscode.editor-utils.VsCodeMessenger");

declare const vscode: {
  postMessage(message: Message): void;
};

type PendingPromise = {
  message: Message;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
};

type Handler = (message: Message) => void;

export default class VSCodeMessenger {
  static instance: VSCodeMessenger;
  static getInstance() {
    if (!VSCodeMessenger.instance) {
      VSCodeMessenger.instance = new VSCodeMessenger();
    }
    return VSCodeMessenger.instance;
  }

  private queue: PendingPromise[] = [];
  private processing = false;
  private handlers: Record<Action, Handler[]> = {} as Record<Action, Handler[]>;

  private constructor() {
    window.addEventListener("message", this.handleIncomingMessage.bind(this));
  }

  public registerHandler(action: Action, handler: Handler): void {
    let handlersForAction = this.handlers[action];
    if (!handlersForAction) {
      handlersForAction = [];
      this.handlers[action] = handlersForAction;
    }
    handlersForAction.push(handler);
  }

  public sendRequest(action: Action, payload?: MessagePayload): Promise<Message> {
    return new Promise((resolve, reject) => {
      const id = uuid();
      this.queue.push({
        message: {
          id,
          type: MessageType.REQUEST,
          action,
          payload,
        },
        resolve,
        reject,
      });
      this.sendNextMessage();
    });
  }

  private sendNextMessage() {
    if (this.queue.length > 0 && !this.processing) {
      this.processing = true;
      const { message } = this.queue[0];
      logger.debug(`Sending message ${JSON.stringify(message, null, 2)}`);
      vscode.postMessage(message);
    }
  }

  private handleIncomingMessage(event: MessageEvent) {
    const message = event.data as Message;
    if (
      message.type === MessageType.RESPONSE &&
      this.queue.length > 0 &&
      message.id === this.queue[0].message.id
    ) {
      logger.debug(`Resolving promise with message ${JSON.stringify(message, null, 2)}`);
      const { resolve } = this.queue.shift()!;
      resolve(message);
      this.processing = false;
      this.sendNextMessage();
    } else if (
      message.type === MessageType.REQUEST &&
      Object.keys(this.handlers).includes(message.action)
    ) {
      logger.debug(`Invoking handler for message ${JSON.stringify(message, null, 2)}`);
      const handlersForEvent = this.handlers[message.action];
      for (const handler of handlersForEvent) {
        handler(message);
      }
    } else {
      logger.debug(`Ignoring message ${JSON.stringify(message, null, 2)}`);
    }
  }
}
