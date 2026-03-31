import cv2
import mediapipe as mp
import numpy as np
import json

BaseOptions = mp.tasks.BaseOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

model_path = 'face_landmarker.task'

options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=model_path),
    running_mode=VisionRunningMode.VIDEO)

def get_eye_vector(landmarks):
    """Calculates the relative position of the iris center within the eye corners."""
    # Left Eye: Iris center (468), Inner corner (133), Outer corner (33)
    l_iris = np.array([landmarks[468].x, landmarks[468].y])
    l_inner = np.array([landmarks[133].x, landmarks[133].y])
    l_outer = np.array([landmarks[33].x, landmarks[33].y])
    
    # Right Eye: Iris center (473), Inner corner (362), Outer corner (263)
    r_iris = np.array([landmarks[473].x, landmarks[473].y])
    r_inner = np.array([landmarks[362].x, landmarks[362].y])
    r_outer = np.array([landmarks[263].x, landmarks[263].y])

    # Relative offset: (Iris - Midpoint of corners)
    l_vec = l_iris - (l_inner + l_outer) / 2
    r_vec = r_iris - (r_inner + r_outer) / 2
    
    avg_vec = (l_vec + r_vec) / 2
    return avg_vec.tolist()

# Define Calibration Points (unit: pixel)
# TODO
h, w = 1080, 1920 # screen resolution
points = [(0, 0), (0, 512), (512, 512)]
calib_data = []
current_pt = 0

# Webcam index
cap = cv2.VideoCapture(0)
cv2.namedWindow("Calibration", cv2.WND_PROP_FULLSCREEN)
cv2.setWindowProperty("Calibration", cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)

with FaceLandmarker.create_from_options(options) as landmarker:
    while current_pt < len(points):
        ret, frame = cap.read()
        if not ret: break
        frame = cv2.flip(frame, 1)
        
        canvas = np.zeros((h, w, 3), dtype=np.uint8)
        target = points[current_pt]
        tx, ty = int(target[0]), int(target[1])
        
        cv2.circle(canvas, (tx, ty), 30, (0, 0, 255), -1)
        cv2.putText(canvas, f"Point {current_pt+1}: Focus on the red dot and press space", (w//2-200, 50), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        result = landmarker.detect_for_video(mp_image, int(cap.get(cv2.CAP_PROP_POS_MSEC)))
        
        cv2.imshow("Calibration", canvas)
        key = cv2.waitKey(1)
        
        if key == ord(' ') and result.face_landmarks:
            vec = get_eye_vector(result.face_landmarks[0])
            calib_data.append({"gaze_vec": vec, "screen_pt": target})
            current_pt += 1
            print(f"Captured: {vec}")

with open("gaze_calibration.json", "w") as f:
    json.dump(calib_data, f)

cap.release()
cv2.destroyAllWindows()