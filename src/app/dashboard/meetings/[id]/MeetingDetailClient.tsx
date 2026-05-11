"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import InviteModal from "@/components/InviteModal";
import AddressSearch, { type AddressResult } from "@/components/AddressSearch";

interface MemberItem {
  userId: string;
  name: string;
  hasLocation: boolean;
  departureAddress: string | null;
}

interface PendingInviteItem {
  toUserId: string;
  toUserName: string;
}

interface SavedLocation {
  name: string;
  address: string;
}

interface Props {
  meetingId: number;
  meetingName: string;
  currentUserId: string;
  currentUserEmail: string;
  myDepartureAddress: string | null;
  myHasLocation: boolean;
  initialMembers: MemberItem[];
  initialPendingInvites: PendingInviteItem[];
  savedLocations: SavedLocation[];
}

type LocationTab = "saved" | "search";

// ── 위치 선택 모달 ────────────────────────────────────────────
function LocationSelectModal({
  savedLocations,
  onSelectSaved,
  onSelectNew,
  onClose,
}: {
  savedLocations: SavedLocation[];
  onSelectSaved: (name: string) => Promise<void>;
  onSelectNew: (result: AddressResult) => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<LocationTab>(
    savedLocations.length > 0 ? "saved" : "search",
  );
  const [selectedSavedName, setSelectedSavedName] = useState<string | null>(
    null,
  );
  const [searchResult, setSearchResult] = useState<AddressResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const canConfirm = tab === "saved" ? !!selectedSavedName : !!searchResult;

  async function handleConfirm() {
    setIsLoading(true);
    if (tab === "saved" && selectedSavedName) {
      await onSelectSaved(selectedSavedName);
    } else if (tab === "search" && searchResult) {
      await onSelectNew(searchResult);
    }
    setIsLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#f0f0f0] rounded-t-2xl">
          <h2 className="text-base font-bold text-[#0d1f2d]">출발지 선택</h2>
          <button
            onClick={onClose}
            className="text-[#9ca3af] hover:text-[#374151] transition-colors cursor-pointer text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-[#f0f0f0] px-6">
          {(["saved", "search"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                tab === t
                  ? "border-[#4ecdc4] text-[#0d1f2d]"
                  : "border-transparent text-[#9ca3af] hover:text-[#6b7280]"
              }`}
            >
              {t === "saved" ? "저장된 위치" : "직접 검색"}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* 저장된 위치 탭 */}
          {tab === "saved" &&
            (savedLocations.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-2xl mb-2">📍</p>
                <p className="text-sm text-[#9ca3af]">저장된 위치가 없어요</p>
                <button
                  onClick={() => setTab("search")}
                  className="mt-2 text-xs text-[#4ecdc4] font-semibold hover:underline cursor-pointer"
                >
                  직접 검색하기
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {savedLocations.map((loc) => (
                  <li key={loc.name}>
                    <button
                      onClick={() => setSelectedSavedName(loc.name)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                        selectedSavedName === loc.name
                          ? "border-[#4ecdc4] bg-[#f0faf9]"
                          : "border-[#e5e7eb] hover:bg-[#f8f9fa]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base shrink-0">📍</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#374151] truncate">
                            {loc.name}
                          </p>
                          <p className="text-xs text-[#9ca3af] truncate mt-0.5">
                            {loc.address}
                          </p>
                        </div>
                        {selectedSavedName === loc.name && (
                          <span className="ml-auto text-[#4ecdc4] shrink-0">
                            ✓
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {/* 직접 검색 탭 */}
          {tab === "search" && (
            <AddressSearch
              onSelect={(result) => setSearchResult(result)}
              placeholder="장소명 또는 주소를 검색하세요"
            />
          )}

          {tab === "search" && searchResult && (
            <div className="px-4 py-3 rounded-xl bg-[#f0faf9] border border-[#4ecdc4]/30">
              <p className="text-xs text-[#0d9488] font-semibold">
                선택된 위치
              </p>
              <p className="text-sm text-[#0d1f2d] font-medium mt-0.5">
                {searchResult.name}
              </p>
              <p className="text-xs text-[#6b7280] mt-0.5">
                {searchResult.address}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-[#e5e7eb] text-sm font-semibold text-[#6b7280] hover:bg-[#f8f9fa] transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || isLoading}
              className="flex-1 py-3 rounded-xl bg-[#0d1f2d] text-white text-sm font-bold hover:bg-[#1a3244] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? "저장 중..." : "선택"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MeetingDetail 메인 ────────────────────────────────────────
export default function MeetingDetailClient({
  meetingId,
  meetingName,
  currentUserId,
  currentUserEmail,
  myDepartureAddress: initialMyDepartureAddress,
  myHasLocation: initialMyHasLocation,
  initialMembers,
  initialPendingInvites,
  savedLocations,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [members, setMembers] = useState<MemberItem[]>(initialMembers);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteItem[]>(
    initialPendingInvites,
  );
  const [myDepartureAddress, setMyDepartureAddress] = useState(
    initialMyDepartureAddress,
  );
  const [myHasLocation, setMyHasLocation] = useState(initialMyHasLocation);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

  // 저장된 위치 선택 시 RPC로 geometry 복사
  async function handleSelectSaved(locationName: string) {
    const { error } = await supabase.rpc("copy_location_to_member", {
      p_user_id: currentUserId,
      p_meeting_id: meetingId,
      p_location_name: locationName,
    });

    if (error) return;

    const saved = savedLocations.find((l) => l.name === locationName);
    const address = saved?.address ?? locationName;

    updateMyLocation(address);
    setShowLocationModal(false);
  }

  // 직접 검색 후 선택
  async function handleSelectNew(result: AddressResult) {
    const { error } = await supabase
      .from("members")
      .update({
        departure_address: result.address,
        departure_location: `POINT(${result.lng} ${result.lat})`,
      })
      .eq("user_id", currentUserId)
      .eq("meeting_id", meetingId);

    if (error) return;

    updateMyLocation(result.address);
    setShowLocationModal(false);
  }

  function updateMyLocation(address: string) {
    setMyDepartureAddress(address);
    setMyHasLocation(true);
    setMembers((prev) =>
      prev.map((m) =>
        m.userId === currentUserId
          ? { ...m, hasLocation: true, departureAddress: address }
          : m,
      ),
    );
  }

  function handleInvited(targets: { toUserId: string; toUserName: string }[]) {
    setPendingInvites((prev) => [...prev, ...targets]);
  }

  const myMember = members.find((m) => m.userId === currentUserId);

  return (
    <>
      {showInviteModal && (
        <InviteModal
          meetingId={meetingId}
          userId={currentUserId}
          userEmail={currentUserEmail}
          onClose={() => setShowInviteModal(false)}
          onInvited={handleInvited}
        />
      )}

      {showLocationModal && (
        <LocationSelectModal
          savedLocations={savedLocations}
          onSelectSaved={handleSelectSaved}
          onSelectNew={handleSelectNew}
          onClose={() => setShowLocationModal(false)}
        />
      )}

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* 서브 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-[#9ca3af] hover:text-[#0d1f2d] transition-colors cursor-pointer text-lg"
            >
              ←
            </button>
            <h1 className="text-xl font-bold text-[#0d1f2d]">{meetingName}</h1>
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-4 py-2 rounded-xl bg-[#0d1f2d] text-white text-xs font-bold hover:bg-[#1a3244] transition-colors cursor-pointer"
          >
            + 초대
          </button>
        </div>

        {/* 인원 현황 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
          <h2 className="text-sm font-bold text-[#0d1f2d] mb-4">
            인원 현황
            <span className="ml-2 text-xs font-normal text-[#9ca3af]">
              {members.length}명 참여{" "}
              {pendingInvites.length > 0 &&
                `· ${pendingInvites.length}명 대기중`}
            </span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {/* 참여 중 멤버 */}
            {members.map((member) => (
              <div
                key={member.userId}
                className={`relative px-3 py-3 rounded-xl border ${
                  member.userId === currentUserId
                    ? "border-[#4ecdc4]/50 bg-[#f0faf9]"
                    : "border-[#f0f0f0] bg-[#f8f9fa]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${member.hasLocation ? "bg-[#4ecdc4]" : "bg-[#e5e7eb]"}`}
                  />
                  <p className="text-sm font-semibold text-[#374151] truncate">
                    {member.name}
                    {member.userId === currentUserId && (
                      <span className="ml-1 text-[10px] text-[#4ecdc4] font-normal">
                        (나)
                      </span>
                    )}
                  </p>
                </div>
                {member.hasLocation ? (
                  <p className="text-xs text-[#9ca3af] truncate pl-4">
                    {member.departureAddress}
                  </p>
                ) : (
                  <p className="text-xs text-[#d1d5db] pl-4">위치 미입력</p>
                )}
              </div>
            ))}

            {/* 초대 대기중 */}
            {pendingInvites.map((inv) => (
              <div
                key={inv.toUserId}
                className="px-3 py-3 rounded-xl border border-dashed border-[#e5e7eb] bg-white"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#e5e7eb] shrink-0" />
                  <p className="text-sm font-semibold text-[#9ca3af] truncate">
                    {inv.toUserName}
                  </p>
                </div>
                <p className="text-xs text-[#c4c9d0] pl-4">초대 대기중</p>
              </div>
            ))}
          </div>
        </section>

        {/* 내 출발지 */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-[#e9ebee]">
          <h2 className="text-sm font-bold text-[#0d1f2d] mb-4">내 출발지</h2>

          {myHasLocation ? (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#f0faf9] border border-[#4ecdc4]/30">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-base shrink-0">📍</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0d9488]">
                    {myMember?.departureAddress ?? myDepartureAddress}
                  </p>
                  <p className="text-xs text-[#0d9488]/60 mt-0.5">
                    출발지 입력 완료
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLocationModal(true)}
                className="text-xs text-[#6b7280] hover:text-[#0d1f2d] font-semibold transition-colors cursor-pointer shrink-0 ml-3"
              >
                변경
              </button>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-2xl mb-2">📍</p>
              <p className="text-sm text-[#6b7280] mb-4">
                출발지를 입력하면 추천 결과를 확인할 수 있어요
              </p>
              <button
                onClick={() => setShowLocationModal(true)}
                className="px-5 py-2.5 rounded-xl bg-[#0d1f2d] text-white text-sm font-bold hover:bg-[#1a3244] transition-colors cursor-pointer"
              >
                출발지 입력하기
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
