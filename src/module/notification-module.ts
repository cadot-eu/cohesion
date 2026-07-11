import { BrowserWindow, Notification } from "electron";
import Cohesion from "../cohesion";
import { getUnreadMessages } from "../util";
import Module from "./module";
import Settings from "../settings";

const settings = new Settings("notifications");

export default class NotificationModule extends Module {

  private _enabled: boolean;
  private lastCount: number = 0;

  constructor(
    private readonly cohesion: Cohesion,
    private readonly window: BrowserWindow
  ) {
    super();
    this._enabled = settings.get("enabled", true);
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(val: boolean) {
    this._enabled = val;
    settings.set("enabled", val);
  }

  public fireTest() {
    this.fireNotification(3);
  }

  public fireContentChanged(text: string) {
    if (!this._enabled) return;

    const notification = new Notification({
      title: "Cohesion",
      body: text,
      icon: this.getIconPath(),
      urgency: "normal",
    });

    notification.on("click", () => {
      this.window.show();
      this.window.focus();
    });

    notification.show();
  }

  public override onLoad() {
    this.cohesion.onTitleUpdateCallbacks.push((title, explicitSet) => {
      if (!explicitSet || !this._enabled) return;

      const count = getUnreadMessages(title);
      if (count > this.lastCount && count > 0) {
        this.fireNotification(count);
      }
      this.lastCount = count;
    });
  }

  private fireNotification(count: number) {
    const body = count === Infinity
      ? "You have 9+ unread notifications in Notion"
      : `You have ${count} unread notification${count > 1 ? "s" : ""} in Notion`;

    const notification = new Notification({
      title: "Cohesion",
      body,
      icon: this.getIconPath(),
      urgency: "normal",
    });

    notification.on("click", () => {
      this.window.show();
      this.window.focus();
    });

    notification.show();
  }

  private getIconPath(): string {
    const { app } = require("electron");
    const { join } = require("path");
    const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
    return join(base, "data", "icons", "hicolor", "512x512", "apps", "io.github.brunofin.Cohesion.png");
  }
}
