import { _decorator, Component, Node, Label, Button, Sprite, Color, SpriteFrame } from 'cc';
import { tween, Vec3 } from 'cc';
import { shuffleArray } from '../utils/utils';
const { ccclass, property } = _decorator;

@ccclass('QuizPanel')
export class QuizPanel extends Component {
    @property(Label)
    questionLabel: Label = null!;

    @property([Button])
    optionButtons: Button[] = [];

    @property(SpriteFrame)
    correctIconSpriteFrame: SpriteFrame = null!;

    @property(SpriteFrame)
    wrongIconSpriteFrame: SpriteFrame = null!;

    private resolveAnswer!: (correct: boolean) => void;
    private correctIndex: number = 0;
    private isCorrect: boolean = false;

    /** 顯示題目，返回使用者是否答對 (固定3選項)*/
    setup(questionData: { question: string, options: string[], answerIndex: number }): Promise<boolean> {
        this.questionLabel.string = questionData.question;

        const options = shuffleArray([...questionData.options.slice(0, 3)]); // 只取前3個
        this.correctIndex = options.indexOf(questionData.options[questionData.answerIndex]);

        const prefix = ['A. ', 'B. ', 'C. '];

        for (let i = 0; i < this.optionButtons.length; i++) {
            const btn = this.optionButtons[i];
            const label = btn.getComponentInChildren(Label);

            if (i < 3) {
                btn.node.active = true;
                label.string = prefix[i] + options[i];

                btn.interactable = true;
                btn.node.off(Node.EventType.MOUSE_ENTER);
                btn.node.off(Node.EventType.MOUSE_LEAVE);
                btn.node.off('click');

                // hover 效果
                btn.node.on(Node.EventType.MOUSE_ENTER, () => {
                    if (btn.interactable) {
                        btn.node.getComponent(Sprite)!.color = new Color(213, 239, 255);
                    }
                });
                btn.node.on(Node.EventType.MOUSE_LEAVE, () => {
                    if (btn.interactable) {
                        btn.node.getComponent(Sprite)!.color = new Color(226, 244, 255);
                    }
                });

                // 點擊事件
                btn.node.once('click', () => this.onSelect(i));
            } else {
                // 第4個選項關閉或隱藏
                btn.node.active = false;
            }
        }

        return new Promise<boolean>((resolve) => {
            this.resolveAnswer = resolve;
        });
    }


    onSelect(index: number) {
        this.isCorrect = index === this.correctIndex;
        
        // 顯示紅綠色
        const btn = this.optionButtons[index];
        btn.node.getComponent(Sprite)!.color = this.isCorrect
            ? new Color(102, 204, 154)
            : new Color(255, 50, 51);
        
        // 選項動畫
        if (this.isCorrect) {
            tween(btn.node)
                .to(0.1, { scale: new Vec3(1.05, 1.05, 1) })
                .to(0.1, { scale: new Vec3(1, 1, 1) })
                .start();
        } else {
            const originalPos = btn.node.position.clone();
            const shakeAmount = 10;
            const shakeDuration = 0.05;

            let shake = tween(btn.node);
            for (let i = 0; i < 3; i++) {
                shake = shake
                    .to(shakeDuration, { position: new Vec3(originalPos.x + (i % 2 === 0 ? shakeAmount : -shakeAmount), originalPos.y, originalPos.z) })
                    .to(shakeDuration, { position: originalPos });
            }
            shake.start();
        }

        // 正確或錯誤圖示
        const sprites = btn.getComponentsInChildren(Sprite);
        const resultIcon = sprites.find(s => s.node !== btn.node);
        if (resultIcon) {
            resultIcon.spriteFrame = this.isCorrect
                ? this.correctIconSpriteFrame  
                : this.wrongIconSpriteFrame;   
            resultIcon.node.active = true;
        }

        // 禁用所有選項
        this.optionButtons.forEach(b => b.interactable = false);

        // 顯示幾秒再回傳結果並關閉面板
        this.scheduleOnce(() => {
            this.resolveAnswer(this.isCorrect); // 等動畫後才回傳
            this.node.destroy();                // 再關閉面板
        }, 1.5);
    }
}
