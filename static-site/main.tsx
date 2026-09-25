import { createRoot } from "react-dom/client";
import { ExplorerApp } from "../app/components/ExplorerApp";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(<ExplorerApp />);
