import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { injectBotSprite } from "../js/lib/bot-sprite.js";
import App from "./App";
import "../css/vezz.css";
import "./styles.css";

document.documentElement.dataset.framework = "react";
injectBotSprite();
createRoot(document.getElementById("app")!).render(
  <HashRouter>
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <App />
    </MotionConfig>
  </HashRouter>,
);
