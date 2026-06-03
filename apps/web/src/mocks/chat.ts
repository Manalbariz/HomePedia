export interface Friend {
  id: string;
  name: string;
  avatar: string;
  status: "online" | "away";
  color: string;
}

export type ChatMessage =
  | {
      id: string;
      from: string;
      text: string;
      time: string;
      type: "text";
    }
  | {
      id: string;
      from: string;
      listingId: string;
      time: string;
      type: "listing";
    };

export const MOCK_FRIENDS: Friend[] = [
  { id: "1", name: "Sophie M.", avatar: "SM", status: "online", color: "#FF4B5C" },
  { id: "2", name: "Thomas K.", avatar: "TK", status: "online", color: "#4F58E8" },
  { id: "3", name: "Marine D.", avatar: "MD", status: "away", color: "#2EC4B6" },
];

export const MOCK_MESSAGES: ChatMessage[] = [
  { id: "1", from: "Sophie M.", text: "J'ai trouvé un appart incroyable !", time: "14:23", type: "text" },
  { id: "2", from: "Sophie M.", listingId: "1", time: "14:24", type: "listing" },
  { id: "3", from: "me", text: "2850€ c'est cher mais le score est top", time: "14:25", type: "text" },
  { id: "4", from: "Thomas K.", text: "J'ai visité hier, le parquet est magnifique", time: "14:26", type: "text" },
  { id: "5", from: "me", text: "On visite ensemble ce weekend ?", time: "14:28", type: "text" },
];
