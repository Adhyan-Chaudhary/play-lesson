import { createRoot } from "react-dom/client";
import { Lesson } from "./Lesson";

const el = document.getElementById("root");
if (!el) throw new Error("no #root");
createRoot(el).render(<Lesson />);
